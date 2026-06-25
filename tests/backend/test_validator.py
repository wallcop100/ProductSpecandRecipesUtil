"""
test_validator.py — Tests for backend/validator.py

Run with:  pytest tests/backend/test_validator.py  (from project root)
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

import pytest
from parser import parse_db, parse_ps, parse_rs
from validator import validate

# ---------------------------------------------------------------------------
# Fixture paths
# ---------------------------------------------------------------------------

FIXTURE_DIR = os.path.join(os.path.dirname(__file__), "..", "fixtures")
DB_FIXTURE = os.path.join(FIXTURE_DIR, "sample_db.xlsx")
PS_FIXTURE = os.path.join(FIXTURE_DIR, "sample_ps.xlsx")
RS_FIXTURE = os.path.join(FIXTURE_DIR, "sample_rs.xlsx")


def _require_fixture(path: str):
    if not os.path.isfile(path):
        pytest.skip(
            f"Fixture not found: {path}. "
            "Run 'python tests/fixtures/create_fixtures.py' to create it."
        )


# ---------------------------------------------------------------------------
# Shared fixture loading (session-scoped for speed)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def full_data():
    for p in (DB_FIXTURE, PS_FIXTURE, RS_FIXTURE):
        _require_fixture(p)
    db_data = parse_db(DB_FIXTURE)
    ps_rows = parse_ps(PS_FIXTURE)
    rs_rows = parse_rs(RS_FIXTURE)
    return db_data, ps_rows, rs_rows


@pytest.fixture(scope="session")
def all_issues(full_data):
    db_data, ps_rows, rs_rows = full_data
    return validate(db_data, ps_rows, rs_rows)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _issues_by_rule(issues: list, rule: str) -> list:
    return [i for i in issues if i["rule"] == rule]


def _issues_by_rule_and_ref(issues: list, rule: str, ref_contains: str) -> list:
    return [
        i for i in issues
        if i["rule"] == rule and ref_contains in (i.get("ref") or "")
    ]


# ---------------------------------------------------------------------------
# MISSING_IS_DESIGN
# ---------------------------------------------------------------------------

class TestMissingIsDesign:
    def test_pt_dl_cc_01_flagged(self, all_issues):
        """PT-DL-CC-01 has no IsDesign='Y' row → should raise MISSING_IS_DESIGN."""
        matching = _issues_by_rule_and_ref(all_issues, "MISSING_IS_DESIGN", "PT-DL-CC-01")
        assert len(matching) >= 1, (
            "Expected MISSING_IS_DESIGN for PT-DL-CC-01 but none found.\n"
            f"All issues: {all_issues}"
        )

    def test_severity_is_error(self, all_issues):
        matching = _issues_by_rule(all_issues, "MISSING_IS_DESIGN")
        for issue in matching:
            assert issue["severity"] == "error"

    def test_pt_dl_local_01_not_flagged(self, all_issues):
        """PT-DL-LOCAL-01 has a valid IsDesign='Y' → must NOT appear in MISSING_IS_DESIGN."""
        matching = _issues_by_rule_and_ref(all_issues, "MISSING_IS_DESIGN", "PT-DL-LOCAL-01")
        assert len(matching) == 0, (
            f"PT-DL-LOCAL-01 unexpectedly raised MISSING_IS_DESIGN: {matching}"
        )

    def test_issue_has_required_keys(self, all_issues):
        for issue in all_issues:
            assert "severity" in issue
            assert "rule" in issue
            assert "message" in issue
            assert "ref" in issue


# ---------------------------------------------------------------------------
# DUPLICATE_IS_DESIGN
# ---------------------------------------------------------------------------

class TestDuplicateIsDesign:
    def test_no_duplicate_in_fixtures(self, all_issues):
        """No position type in the fixture has more than one IsDesign='Y' row."""
        matching = _issues_by_rule(all_issues, "DUPLICATE_IS_DESIGN")
        assert len(matching) == 0, (
            f"Unexpected DUPLICATE_IS_DESIGN issues: {matching}"
        )

    def test_detected_when_two_is_design_rows(self, full_data):
        """Inject two IsDesign rows for the same PT → must detect DUPLICATE_IS_DESIGN."""
        db_data, ps_rows, rs_rows = full_data
        extra_rs = list(rs_rows) + [
            {
                "PositionTypeRef": "PT-DL-LOCAL-01",
                "ContextType": "PositionType",
                "ContextRef": "PT-DL-LOCAL-01",
                "RecipeIndex": 99,
                "ElementTypeRef": "ET-EXTRA-01",
                "Quantity": None,
                "Dim_QuantityMultiplier": None,
                "Dim_Quantity": None,
                "IsInteger": None,
                "IsDesign": "Y",   # second IsDesign for same PT
                "IsContractItem": None,
                "IsTBC": None,
                "IsPropertiesTBC": None,
                "Notes": "",
            }
        ]
        issues = validate(db_data, ps_rows, extra_rs)
        dup = _issues_by_rule_and_ref(issues, "DUPLICATE_IS_DESIGN", "PT-DL-LOCAL-01")
        assert len(dup) >= 1, f"Expected DUPLICATE_IS_DESIGN, got: {issues}"


# ---------------------------------------------------------------------------
# DUPLICATE_PRODUCT_CODE
# ---------------------------------------------------------------------------

class TestDuplicateProductCode:
    def test_tape_01_flagged(self, all_issues):
        """TAPE-01 is used for two different ElementTypes → DUPLICATE_PRODUCT_CODE."""
        matching = _issues_by_rule(all_issues, "DUPLICATE_PRODUCT_CODE")
        tape_issues = [i for i in matching if "TAPE-01" in (i.get("ref") or "")]
        assert len(tape_issues) >= 1, (
            f"Expected DUPLICATE_PRODUCT_CODE for TAPE-01, got: {matching}"
        )

    def test_na_not_flagged(self, all_issues):
        """'N/A' is allowed to repeat; it must not trigger DUPLICATE_PRODUCT_CODE."""
        matching = _issues_by_rule(all_issues, "DUPLICATE_PRODUCT_CODE")
        na_issues = [i for i in matching if "N/A" in (i.get("ref") or "")]
        assert len(na_issues) == 0

    def test_severity_is_error(self, all_issues):
        matching = _issues_by_rule(all_issues, "DUPLICATE_PRODUCT_CODE")
        for issue in matching:
            assert issue["severity"] == "error"

    def test_unique_codes_not_flagged(self, full_data):
        db_data, _, rs_rows = full_data
        # All unique codes — should produce zero DUPLICATE_PRODUCT_CODE issues
        ps_unique = [
            {"ElementTypeRef": "ET-A", "ProductCode": "CODE-A"},
            {"ElementTypeRef": "ET-B", "ProductCode": "CODE-B"},
        ]
        issues = validate(db_data, ps_unique, rs_rows)
        assert len(_issues_by_rule(issues, "DUPLICATE_PRODUCT_CODE")) == 0


# ---------------------------------------------------------------------------
# MISSING_LOCKING_LEVER
# ---------------------------------------------------------------------------

class TestMissingLockingLever:
    def test_pt_lin_01_flagged(self, all_issues):
        """PT-LIN-01 has SecondaryPowerType='CV' but no locking lever ingredient."""
        matching = _issues_by_rule_and_ref(all_issues, "MISSING_LOCKING_LEVER", "PT-LIN-01")
        assert len(matching) >= 1, (
            f"Expected MISSING_LOCKING_LEVER for PT-LIN-01, got: {all_issues}"
        )

    def test_severity_is_error(self, all_issues):
        matching = _issues_by_rule(all_issues, "MISSING_LOCKING_LEVER")
        for issue in matching:
            assert issue["severity"] == "error"

    def test_non_cv_pt_not_flagged(self, all_issues):
        """CC position types (non-CV) must not appear in MISSING_LOCKING_LEVER."""
        matching = _issues_by_rule(all_issues, "MISSING_LOCKING_LEVER")
        refs = [i.get("ref", "") or "" for i in matching]
        # PT-DL-LOCAL-01 is CC, not CV
        assert not any("PT-DL-LOCAL-01" in r for r in refs)

    def test_cv_with_lever_not_flagged(self, full_data):
        """A CV position type that DOES have a locking lever must not be flagged."""
        db_data, ps_rows, rs_rows = full_data
        extra_rs = list(rs_rows) + [
            {
                "PositionTypeRef": "PT-LIN-01",
                "ContextType": "PositionType",
                "ContextRef": "PT-LIN-01",
                "RecipeIndex": 10,
                "ElementTypeRef": "ET-LLOCK-01",  # contains LLOCK
                "Quantity": 1,
                "Dim_QuantityMultiplier": None,
                "Dim_Quantity": None,
                "IsInteger": None,
                "IsDesign": None,
                "IsContractItem": "Y",
                "IsTBC": None,
                "IsPropertiesTBC": None,
                "Notes": "",
            }
        ]
        issues = validate(db_data, ps_rows, extra_rs)
        missing = _issues_by_rule_and_ref(issues, "MISSING_LOCKING_LEVER", "PT-LIN-01")
        assert len(missing) == 0, f"PT-LIN-01 with locking lever should not be flagged: {missing}"


# ---------------------------------------------------------------------------
# DIM_QTY_MULT_NOT_ONE
# ---------------------------------------------------------------------------

class TestDimQtyMultNotOne:
    def test_tape_profile_diff_with_one_not_flagged(self, full_data):
        """TAPE, PROFILE, DIFF rows with Dim_QuantityMultiplier=1 must not be flagged."""
        db_data, ps_rows, rs_rows = full_data
        issues = validate(db_data, ps_rows, rs_rows)
        mult_issues = _issues_by_rule(issues, "DIM_QTY_MULT_NOT_ONE")
        # The fixture sets Dim_QuantityMultiplier=1 for TAPE, PROFILE, DIFF in PT-LIN-01
        flagged_refs = [i.get("ref") or "" for i in mult_issues]
        # No PT-LIN-01 tape/profile/diff row should appear (all have mult=1)
        lin_tape_flagged = [r for r in flagged_refs if "PT-LIN-01" in r]
        assert len(lin_tape_flagged) == 0

    def test_tape_with_wrong_mult_flagged(self, full_data):
        """A TAPE row with Dim_QuantityMultiplier != 1 should produce a warning."""
        db_data, ps_rows, rs_rows = full_data
        bad_rs = list(rs_rows) + [
            {
                "PositionTypeRef": "PT-LIN-01",
                "ContextType": "ElementType",
                "ContextRef": "ET-LIN-01",
                "RecipeIndex": 99,
                "ElementTypeRef": "ET-TAPE-EXTRA",
                "Quantity": None,
                "Dim_QuantityMultiplier": 2,  # wrong
                "Dim_Quantity": None,
                "IsInteger": None,
                "IsDesign": None,
                "IsContractItem": None,
                "IsTBC": None,
                "IsPropertiesTBC": None,
                "Notes": "",
            }
        ]
        issues = validate(db_data, ps_rows, bad_rs)
        flagged = _issues_by_rule(issues, "DIM_QTY_MULT_NOT_ONE")
        tape_flagged = [i for i in flagged if "ET-TAPE-EXTRA" in (i.get("ref") or "")]
        assert len(tape_flagged) >= 1

    def test_severity_is_warning(self, full_data):
        db_data, ps_rows, rs_rows = full_data
        bad_rs = list(rs_rows) + [
            {
                "PositionTypeRef": "PT-LIN-01",
                "ContextType": "ElementType",
                "ContextRef": "ET-LIN-01",
                "RecipeIndex": 99,
                "ElementTypeRef": "ET-FLEX-EXTRA",
                "Quantity": None,
                "Dim_QuantityMultiplier": None,  # None also triggers the warning
                "Dim_Quantity": None,
                "IsInteger": None,
                "IsDesign": None,
                "IsContractItem": None,
                "IsTBC": None,
                "IsPropertiesTBC": None,
                "Notes": "",
            }
        ]
        issues = validate(db_data, ps_rows, bad_rs)
        flagged = _issues_by_rule(issues, "DIM_QTY_MULT_NOT_ONE")
        for issue in flagged:
            assert issue["severity"] == "warning"


# ---------------------------------------------------------------------------
# MISSING_CLIPS_DIM_QTY
# ---------------------------------------------------------------------------

class TestMissingClipsDimQty:
    def test_clip_with_dim_qty_not_flagged(self, all_issues):
        """PT-LIN-01 CLIP row has Dim_Quantity=3.2 → must not be flagged."""
        matching = _issues_by_rule_and_ref(all_issues, "MISSING_CLIPS_DIM_QTY", "PT-LIN-01")
        assert len(matching) == 0, (
            f"CLIP row with Dim_Quantity should not be flagged: {matching}"
        )

    def test_clip_without_dim_qty_flagged(self, full_data):
        """A CLIP row with Dim_Quantity=None should trigger MISSING_CLIPS_DIM_QTY."""
        db_data, ps_rows, rs_rows = full_data
        extra_rs = list(rs_rows) + [
            {
                "PositionTypeRef": "PT-LIN-01",
                "ContextType": "PositionType",
                "ContextRef": "PT-LIN-01",
                "RecipeIndex": 20,
                "ElementTypeRef": "ET-CLIP-EXTRA",
                "Quantity": None,
                "Dim_QuantityMultiplier": None,
                "Dim_Quantity": None,  # missing!
                "IsInteger": None,
                "IsDesign": None,
                "IsContractItem": None,
                "IsTBC": None,
                "IsPropertiesTBC": None,
                "Notes": "",
            }
        ]
        issues = validate(db_data, ps_rows, extra_rs)
        matching = _issues_by_rule(issues, "MISSING_CLIPS_DIM_QTY")
        clip_issues = [i for i in matching if "ET-CLIP-EXTRA" in (i.get("ref") or "")]
        assert len(clip_issues) >= 1

    def test_severity_is_warning(self, full_data):
        db_data, ps_rows, rs_rows = full_data
        extra_rs = list(rs_rows) + [
            {
                "PositionTypeRef": "PT-LIN-01",
                "ContextType": "PositionType",
                "ContextRef": "PT-LIN-01",
                "RecipeIndex": 21,
                "ElementTypeRef": "ET-CLIP-W",
                "Quantity": None,
                "Dim_QuantityMultiplier": None,
                "Dim_Quantity": None,
                "IsInteger": None,
                "IsDesign": None,
                "IsContractItem": None,
                "IsTBC": None,
                "IsPropertiesTBC": None,
                "Notes": "",
            }
        ]
        issues = validate(db_data, ps_rows, extra_rs)
        matching = [
            i for i in issues
            if i["rule"] == "MISSING_CLIPS_DIM_QTY" and "ET-CLIP-W" in (i.get("ref") or "")
        ]
        for issue in matching:
            assert issue["severity"] == "warning"


# ---------------------------------------------------------------------------
# Valid recipe — no spurious errors
# ---------------------------------------------------------------------------

class TestValidRecipeClean:
    def test_local_downlight_no_errors(self, full_data):
        """A minimal valid DB + PS + RS should return zero issues."""
        db_data_minimal = {
            "element_types": [
                {"ElementTypeRef": "ET-DL-01", "Name": "Downlight Virtual", "Family": "DL", "Variant": "Std"}
            ],
            "position_types": [
                {
                    "PositionTypeRef": "PT-DL-LOCAL-01",
                    "Name": "Standard Local Downlight",
                    "DriverLocation": "Local",
                    "SecondaryPowerType": "CC",
                    "ControlTypeRef": "DALI",
                    "SecondaryPowerNodes_+ve": 1,
                }
            ],
        }
        ps_minimal = [
            {
                "ElementTypeRef": "ET-DL-01",
                "ProductCode": "N/A",
                "SupplierCode": None,
                "Description": "Downlight",
                "IsDesign": "Y",
                "IsContractItem": None,
                "IsTBC": None,
                "IsPropertiesTBC": None,
                "Notes": None,
            }
        ]
        rs_minimal = [
            {
                "PositionTypeRef": "PT-DL-LOCAL-01",
                "ContextType": "PositionType",
                "ContextRef": "PT-DL-LOCAL-01",
                "RecipeIndex": 1,
                "ElementTypeRef": "ET-DL-01",
                "Quantity": None,
                "Dim_QuantityMultiplier": None,
                "Dim_Quantity": None,
                "IsInteger": None,
                "IsDesign": "Y",
                "IsContractItem": None,
                "IsTBC": None,
                "IsPropertiesTBC": None,
                "Notes": None,
            }
        ]
        issues = validate(db_data_minimal, ps_minimal, rs_minimal)
        errors = [i for i in issues if i["severity"] == "error"]
        assert len(errors) == 0, f"Unexpected errors for a valid recipe: {errors}"
