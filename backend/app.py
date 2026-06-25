"""
app.py — Flask backend for Recipe Builder.

Routes
------
GET  /ping
GET  /detect-files?folder=<path>
POST /import
POST /validate
POST /patch
"""

from __future__ import annotations

import os
import sys

from flask import Flask, jsonify, request

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from parser import detect_files, parse_db, parse_ps, parse_rs  # noqa: E402
from validator import validate as _validate  # noqa: E402
from patcher import backup_file  # noqa: E402

import openpyxl  # noqa: E402

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = Flask(__name__)

from flask_cors import CORS  # noqa: E402
CORS(app)

# ---------------------------------------------------------------------------
# Field → Excel column name maps (used by the row-level patcher)
# ---------------------------------------------------------------------------

RS_FIELD_TO_EXCEL = {
    'ContextType':            'ContextType',
    'ContextRef':             'ContextRef',
    'RecipeIndex':            'RecipeIndex',
    'ElementTypeRef':         'EntityRef',
    'SortOrder':              'Sort Order',
    'Quantity':               'Quantity',
    'PackQuantity':           'PackQuantity',
    'IsDeleted':              'IsDeleted',
    'IsDesign':               'IsDesign',
    'IsContractItem':         'IsContractItem',
    'IsTRItem':               'IsTRItem',
    'Dim_QuantityMultiplier': 'Dim_QuantityMultiplier',
    'IsInteger':              'IsInteger',
}

PS_FIELD_TO_EXCEL = {
    'ElementTypeRef':      'EntityRef',
    'Manufacturer':        'Manufacturer',
    'ProductCode':         'ProductCode',
    'ComponentDescription':'ComponentDescription',
    'InternalNotesText':   'InternalNotesText',
    'IsTBC':               'IsTBC',
    'IsDeleted':           'IsDeleted',
    'IsPropertiesTBC':     'IsPropertiesTBC',
}


# ---------------------------------------------------------------------------
# Row-level patch engine
# ---------------------------------------------------------------------------

def _apply_row_level_patch(filepath, sheet_name, field_to_excel, changes):
    """
    Apply row-level changes to the 'Form' sheet of an xlsx file.

    Two change formats are supported:

    RS format (row-level):
        [{"_id": str, "action": "upsert"|"delete", "row": {..., "_row_num": int|None}}, ...]

    PS format (field-level):
        [{"elementTypeRef": str, "updates": {field: value, ...}}, ...]

    RS upsert logic:
        - row._row_num set  → update that existing Excel row
        - row._row_num None → append a new row at the bottom
    RS delete:
        - row._row_num set  → soft-delete by writing IsDeleted='Y'

    Multiple changes for the same _id are deduplicated (last write wins).
    """
    if not os.path.isfile(filepath):
        return {'success': False, 'error': f'File not found: {filepath}'}

    if not changes:
        return {'success': False, 'error': 'No changes provided.'}

    backup_path = backup_file(filepath)

    try:
        wb = openpyxl.load_workbook(filepath)
    except Exception as exc:
        return {'success': False, 'error': f'Could not open workbook: {exc}'}

    if sheet_name not in wb.sheetnames:
        return {'success': False, 'error': f"Sheet '{sheet_name}' not found"}

    ws = wb[sheet_name]

    # Read headers → 1-based column index map
    header_to_col = {}
    for c in range(1, ws.max_column + 1):
        val = ws.cell(row=1, column=c).value
        if val is not None:
            header_to_col[str(val).strip()] = c

    is_ps_format = changes and 'elementTypeRef' in changes[0]

    if is_ps_format:
        entity_ref_col = header_to_col.get('EntityRef')
        if not entity_ref_col:
            return {'success': False, 'error': "Column 'EntityRef' not found in PS sheet"}

        ref_to_row = {}
        for rn in range(2, ws.max_row + 1):
            val = ws.cell(row=rn, column=entity_ref_col).value
            if val:
                ref_to_row[str(val).strip()] = rn

        for change in changes:
            et_ref = change.get('elementTypeRef')
            updates = change.get('updates') or {}
            is_new = change.get('_isNew', False)
            row_num = ref_to_row.get(et_ref)

            if not row_num:
                if not is_new:
                    continue
                # Append new row: write EntityRef first, then any non-null update fields
                row_num = ws.max_row + 1
                if entity_ref_col:
                    ws.cell(row=row_num, column=entity_ref_col).value = et_ref

            for field_name, value in updates.items():
                if value is None:
                    continue
                excel_col = field_to_excel.get(field_name)
                if excel_col and excel_col in header_to_col:
                    ws.cell(row=row_num, column=header_to_col[excel_col]).value = value

    else:
        # RS row-level: deduplicate by _id (last write wins, delete trumps)
        latest = {}
        for change in changes:
            cid = change.get('_id')
            if not cid:
                continue
            action = change.get('action', 'upsert')
            row = change.get('row') or {}
            if cid not in latest:
                latest[cid] = {'action': action, 'row': row}
            else:
                if action == 'delete':
                    latest[cid]['action'] = 'delete'
                    # Preserve previously seen row data for _row_num lookup
                    if not latest[cid]['row']:
                        latest[cid]['row'] = row
                else:
                    latest[cid] = {'action': action, 'row': row}

        isdeleted_col = header_to_col.get('IsDeleted')
        entity_type_col = header_to_col.get('EntityType')

        for entry in latest.values():
            action = entry['action']
            row = entry['row']
            row_num = row.get('_row_num') if row else None

            if action == 'delete':
                if row_num and isdeleted_col:
                    ws.cell(row=row_num, column=isdeleted_col).value = 'Y'

            elif action == 'upsert':
                target_row = row_num if row_num else ws.max_row + 1

                if not row_num and entity_type_col:
                    ws.cell(row=target_row, column=entity_type_col).value = 'ElementType'

                for field_name, excel_col_name in field_to_excel.items():
                    if excel_col_name not in header_to_col:
                        continue
                    if field_name not in row:
                        continue
                    ws.cell(
                        row=target_row,
                        column=header_to_col[excel_col_name],
                    ).value = row[field_name]

    try:
        wb.save(filepath)
    except Exception as exc:
        return {'success': False, 'error': f'Could not save workbook: {exc}'}

    return {'success': True, 'backup_path': backup_path}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _error(message: str, status: int = 400):
    return jsonify({'error': message}), status


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/ping', methods=['GET'])
def ping():
    return jsonify({'status': 'ok'})


@app.route('/detect-files', methods=['GET'])
def detect_files_route():
    folder = request.args.get('folder', '').strip()
    if not folder:
        return _error("'folder' query parameter is required.")
    result = detect_files(folder)
    return jsonify(result)


@app.route('/import', methods=['POST'])
def import_files():
    body = request.get_json(force=True, silent=True)
    if not body:
        return _error('Request body must be JSON.')

    db_path = body.get('db', '').strip()
    ps_path = body.get('ps', '').strip()
    rs_path = body.get('rs', '').strip()

    missing = [name for name, path in [('db', db_path), ('ps', ps_path), ('rs', rs_path)] if not path]
    if missing:
        return _error(f"Missing file path(s): {', '.join(missing)}")

    errors = []
    for label, path in [('db', db_path), ('ps', ps_path), ('rs', rs_path)]:
        if not os.path.isfile(path):
            errors.append(f"{label}: file not found at '{path}'")
    if errors:
        return _error('; '.join(errors))

    try:
        db_data = parse_db(db_path)
    except Exception as exc:
        return _error(f'Failed to parse DB file: {exc}')

    try:
        ps_rows = parse_ps(ps_path)
    except Exception as exc:
        return _error(f'Failed to parse PS file: {exc}')

    try:
        rs_rows = parse_rs(rs_path)
    except Exception as exc:
        return _error(f'Failed to parse RS file: {exc}')

    return jsonify({'db': db_data, 'ps': ps_rows, 'rs': rs_rows})


@app.route('/validate', methods=['POST'])
def validate_route():
    body = request.get_json(force=True, silent=True)
    if not body:
        return _error('Request body must be JSON.')

    db_data = body.get('db_data')
    ps_rows = body.get('ps_rows')
    rs_rows = body.get('rs_rows')

    if db_data is None or ps_rows is None or rs_rows is None:
        return _error("Body must include 'db_data', 'ps_rows', and 'rs_rows'.")

    issues = _validate(db_data, ps_rows, rs_rows)
    return jsonify({'issues': issues})


@app.route('/patch', methods=['POST'])
def patch_route():
    """
    Apply changes to a PS or RS xlsx file.

    Body (JSON)
    -----------
    {
        "target":   "ps" | "rs",
        "filepath": "/abs/path/to/file.xlsx",
        "changes":  [...]
    }

    RS changes: [{_id, action, row: {..., _row_num?}}]
    PS changes: [{elementTypeRef, updates: {field: value}}]
    """
    body = request.get_json(force=True, silent=True)
    if not body:
        return _error('Request body must be JSON.')

    target = body.get('target', '').strip().lower()
    filepath = body.get('filepath', '').strip()
    changes = body.get('changes')

    if target not in ('ps', 'rs'):
        return _error("'target' must be 'ps' or 'rs'.")
    if not filepath:
        return _error("'filepath' is required.")
    if not isinstance(changes, list) or not changes:
        return _error("'changes' must be a non-empty array.")

    field_map = PS_FIELD_TO_EXCEL if target == 'ps' else RS_FIELD_TO_EXCEL
    result = _apply_row_level_patch(filepath, 'Form', field_map, changes)

    if result['success']:
        return jsonify(result)
    return jsonify(result), 422


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, debug=False)
