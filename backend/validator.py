"""
validator.py — Business-rule validation for Recipe Builder.

All validation rules are collected via validate() which returns a list of
issue dicts:

    {"severity": "error"|"warning", "rule": str, "message": str, "ref": str|None}
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any


# ---------------------------------------------------------------------------
# Keywords used by individual rules
# ---------------------------------------------------------------------------

# ElementTypeRefs that require Dim_QuantityMultiplier = 1
DIM_QTY_MULT_KEYWORDS = {"TAPE", "PROFILE", "DIFF", "MOUNT", "FLEX"}

# Keywords that indicate a locking-lever element type
LOCKING_LEVER_KEYWORDS = {"LLOCK", "LEVER"}

# Clips keyword
CLIPS_KEYWORD = "CLIP"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _contains_any(text: str | None, keywords: set[str]) -> bool:
    """Return True if *text* contains any of *keywords* (case-insensitive)."""
    if not text:
        return False
    upper = text.upper()
    return any(kw in upper for kw in keywords)


def _issue(severity: str, rule: str, message: str, ref: str | None = None) -> dict:
    return {"severity": severity, "rule": rule, "message": message, "ref": ref}


# ---------------------------------------------------------------------------
# Individual rule implementations
# ---------------------------------------------------------------------------

def _check_is_design(db_data: dict, rs_rows: list) -> list:
    """
    MISSING_IS_DESIGN / DUPLICATE_IS_DESIGN

    Each position type defined in the DB must have **exactly one** RS row
    where ContextType="PositionType" and IsDesign="Y".
    """
    issues = []

    # Collect all known position type refs
    known_pts = {pt["PositionTypeRef"] for pt in db_data.get("position_types", [])
                 if pt.get("PositionTypeRef")}

    # Group RS rows by PositionTypeRef, only PositionType context rows
    design_counts: dict[str, int] = defaultdict(int)
    referenced_pts: set[str] = set()

    for row in rs_rows:
        pt_ref = row.get("PositionTypeRef")
        if not pt_ref:
            continue
        referenced_pts.add(pt_ref)
        if row.get("ContextType") == "PositionType" and row.get("IsDesign") == "Y":
            design_counts[pt_ref] += 1

    # Check every PT that appears in the RS data (union with known PTs)
    pts_to_check = known_pts | referenced_pts

    for pt_ref in sorted(pts_to_check):
        count = design_counts.get(pt_ref, 0)
        if count == 0:
            issues.append(_issue(
                "error",
                "MISSING_IS_DESIGN",
                f"PositionType '{pt_ref}' has no RS row with IsDesign='Y' "
                f"at PositionType context level.",
                pt_ref,
            ))
        elif count > 1:
            issues.append(_issue(
                "error",
                "DUPLICATE_IS_DESIGN",
                f"PositionType '{pt_ref}' has {count} RS rows with IsDesign='Y' "
                f"at PositionType context level (expected exactly 1).",
                pt_ref,
            ))

    return issues


def _check_duplicate_product_code(ps_rows: list) -> list:
    """
    DUPLICATE_PRODUCT_CODE

    ProductCode values must be unique across the PS form, except "N/A"
    (which is used for virtual elements and is allowed to repeat).
    """
    issues = []
    code_to_refs: dict[str, list[str]] = defaultdict(list)

    for row in ps_rows:
        code = row.get("ProductCode")
        et_ref = row.get("ElementTypeRef") or "<unknown>"
        if code and str(code).strip().upper() != "N/A":
            code_to_refs[str(code).strip()].append(et_ref)

    for code, refs in sorted(code_to_refs.items()):
        if len(refs) > 1:
            issues.append(_issue(
                "error",
                "DUPLICATE_PRODUCT_CODE",
                f"ProductCode '{code}' is used by multiple ElementTypes: "
                + ", ".join(refs),
                code,
            ))

    return issues


def _get_cv_position_refs(db_data: dict) -> set[str]:
    """Return the set of PositionTypeRefs that have SecondaryPowerType='CV' (LIN positions)."""
    cv_refs: set[str] = set()
    for pt in db_data.get("position_types", []):
        if str(pt.get("SecondaryPowerType") or "").strip().upper() == "CV":
            ref = pt.get("PositionTypeRef")
            if ref:
                cv_refs.add(ref)
    return cv_refs


def _check_missing_locking_lever(db_data: dict, rs_rows: list) -> list:
    """
    MISSING_LOCKING_LEVER

    LIN position types (SecondaryPowerType="CV") must have at least one
    ingredient with "LLOCK" or "LEVER" in the ElementTypeRef at the
    PositionType context level.
    """
    issues = []
    cv_pt_refs = _get_cv_position_refs(db_data)

    if not cv_pt_refs:
        return issues

    # For each CV position type, check for a locking lever ingredient at PositionType level
    locking_lever_found: set[str] = set()

    for row in rs_rows:
        pt_ref = row.get("PositionTypeRef")
        if pt_ref not in cv_pt_refs:
            continue
        if row.get("ContextType") != "PositionType":
            continue
        et_ref = row.get("ElementTypeRef") or ""
        if _contains_any(et_ref, LOCKING_LEVER_KEYWORDS):
            locking_lever_found.add(pt_ref)

    for pt_ref in sorted(cv_pt_refs):
        if pt_ref not in locking_lever_found:
            issues.append(_issue(
                "error",
                "MISSING_LOCKING_LEVER",
                f"LIN/CV PositionType '{pt_ref}' has no locking lever ingredient "
                f"(ElementTypeRef containing 'LLOCK' or 'LEVER') at the PositionType level.",
                pt_ref,
            ))

    return issues


def _check_dim_qty_mult_not_one(rs_rows: list) -> list:
    """
    DIM_QTY_MULT_NOT_ONE

    For RS rows whose ElementTypeRef contains TAPE, PROFILE, DIFF, MOUNT, or
    FLEX — Dim_QuantityMultiplier should be 1.  Warn if it is anything else
    (including None / missing).
    """
    issues = []

    for row in rs_rows:
        et_ref = row.get("ElementTypeRef") or ""
        if not _contains_any(et_ref, DIM_QTY_MULT_KEYWORDS):
            continue

        mult = row.get("Dim_QuantityMultiplier")
        # Convert to number if possible
        try:
            mult_val = float(mult) if mult is not None else None
        except (ValueError, TypeError):
            mult_val = None

        if mult_val != 1.0:
            pt_ref = row.get("PositionTypeRef", "<unknown>")
            issues.append(_issue(
                "warning",
                "DIM_QTY_MULT_NOT_ONE",
                f"RS row for '{et_ref}' in PositionType '{pt_ref}' has "
                f"Dim_QuantityMultiplier={mult!r} (expected 1).",
                f"{pt_ref}:{et_ref}",
            ))

    return issues


def _check_exterior_wrong_connector(db_data: dict, rs_rows: list) -> list:
    """
    EXTERIOR_WRONG_CONNECTOR

    For position types where DriverLocation='Local' and the position name or
    ref contains an IP indicator (e.g. "Ext", "Exterior", "IP"), warn if any
    connector-type ingredients at the PositionType level don't contain "IP"
    in their ElementTypeRef.

    'Connector-type' is inferred from the ElementTypeRef containing "Pin" or
    "Conn" (common naming convention for connector elements).
    """
    issues = []

    # Build a set of "exterior" position type refs (DriverLocation=Local + name hint)
    exterior_pt_refs: set[str] = set()
    for pt in db_data.get("position_types", []):
        driver_loc = str(pt.get("DriverLocation") or "").strip().upper()
        name = str(pt.get("Name") or "")
        ref = str(pt.get("PositionTypeRef") or "")
        if driver_loc == "LOCAL":
            indicator = (name + " " + ref).upper()
            if any(kw in indicator for kw in ("EXT", "EXTERIOR", "-IP", "IP65", "IP67", "IP68")):
                exterior_pt_refs.add(pt["PositionTypeRef"])

    if not exterior_pt_refs:
        return issues

    # Connector keywords — broad enough to catch typical naming
    connector_kws = {"PIN", "CONN", "SOCKET", "PLUG"}

    for row in rs_rows:
        pt_ref = row.get("PositionTypeRef")
        if pt_ref not in exterior_pt_refs:
            continue
        if row.get("ContextType") != "PositionType":
            continue
        et_ref = str(row.get("ElementTypeRef") or "")
        if not _contains_any(et_ref, connector_kws):
            continue
        if "IP" not in et_ref.upper():
            issues.append(_issue(
                "warning",
                "EXTERIOR_WRONG_CONNECTOR",
                f"Exterior PositionType '{pt_ref}' uses connector '{et_ref}' "
                f"which does not appear to be IP-rated (no 'IP' in ElementTypeRef).",
                f"{pt_ref}:{et_ref}",
            ))

    return issues


def _check_missing_clips_dim_qty(db_data: dict, rs_rows: list) -> list:
    """
    MISSING_CLIPS_DIM_QTY

    LIN/CV positions with a CLIPS ingredient: if Dim_Quantity is null, warn.
    """
    issues = []
    cv_pt_refs = _get_cv_position_refs(db_data)

    for row in rs_rows:
        pt_ref = row.get("PositionTypeRef")
        if pt_ref not in cv_pt_refs:
            continue
        et_ref = str(row.get("ElementTypeRef") or "")
        if not _contains_any(et_ref, {CLIPS_KEYWORD}):
            continue
        dim_qty = row.get("Dim_Quantity")
        if dim_qty is None:
            issues.append(_issue(
                "warning",
                "MISSING_CLIPS_DIM_QTY",
                f"LIN PositionType '{pt_ref}' has CLIPS ingredient '{et_ref}' "
                f"with no Dim_Quantity — confirm clips-per-metre with manufacturer.",
                f"{pt_ref}:{et_ref}",
            ))

    return issues


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def validate(db_data: dict, ps_rows: list, rs_rows: list) -> list:
    """
    Run all validation rules against the parsed data.

    Parameters
    ----------
    db_data:
        Result of parser.parse_db() — contains "element_types" and
        "position_types" lists.
    ps_rows:
        Result of parser.parse_ps().
    rs_rows:
        Result of parser.parse_rs().

    Returns
    -------
    list of issue dicts, each with keys:
        severity  — "error" | "warning"
        rule      — unique rule identifier string
        message   — human-readable description
        ref       — relevant reference string or None
    """
    issues: list[dict] = []

    issues.extend(_check_is_design(db_data, rs_rows))
    issues.extend(_check_duplicate_product_code(ps_rows))
    issues.extend(_check_missing_locking_lever(db_data, rs_rows))
    issues.extend(_check_dim_qty_mult_not_one(rs_rows))
    issues.extend(_check_exterior_wrong_connector(db_data, rs_rows))
    issues.extend(_check_missing_clips_dim_qty(db_data, rs_rows))

    return issues
