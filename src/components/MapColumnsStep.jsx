import React, { useMemo } from 'react'
import { Button, Form } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'

/**
 * MapColumnsStep — tell the tool which columns matter.
 *
 * A bare list of selects gives you no way to know whether "PRODUCT CODES SHOWING OLD
 * AND NEW" or "ProductCode" is the one you want. So each mapping shows a LIVE SAMPLE
 * from the sheet: the first row that actually has a value in that column. Choosing
 * becomes reading, not guessing.
 *
 * The tool's own guesses are marked "auto", so you can see what it assumed.
 */

const FIELDS = [
  {
    key: 'code', icon: 'key', required: true,
    label: 'Product code',
    hint: 'The freehand field this whole workflow untangles.',
  },
  {
    key: 'pt', icon: 'label',
    label: 'PositionType',
    hint: 'Which position each product belongs to. Without it nothing can be reconciled.',
  },
  {
    key: 'mfr', icon: 'factory',
    label: 'Manufacturer',
    hint: 'A product is (manufacturer, code) — the same code from two makers is two products.',
  },
  {
    key: 'exclude', icon: 'filter_alt',
    label: 'Exclude rows where set',
    hint: 'Any non-blank value (other than "no") drops the row.',
  },
]

/** The first value this column actually carries. Blank columns say so. */
function sampleOf(rows, header) {
  if (!header) return null
  for (const r of rows) {
    const v = r[header]
    if (v != null && String(v).trim() !== '') return String(v)
  }
  return ''
}

export default function MapColumnsStep({
  sheets, sheet, onSheet, headers, rawRows, map, onMap, autoMap = {},
  skipped = 0, busy = false, onStart,
}) {
  const options = useMemo(() => headers.filter(Boolean), [headers])
  const set = (key, value) => onMap(m => ({ ...m, [key]: value }))

  const toggleContext = h => onMap(m => ({
    ...m,
    context: m.context.includes(h) ? m.context.filter(x => x !== h) : [...m.context, h],
  }))

  // Only columns that carry something are worth offering as context.
  const usefulHeaders = useMemo(
    () => options.filter(h => sampleOf(rawRows, h) !== ''),
    [options, rawRows]
  )

  const preview = rawRows.find(r => map.code && r[map.code] != null && String(r[map.code]).trim() !== '')

  return (
    <div style={{ maxWidth: 780, overflowY: 'auto' }}>
      <div className="mb-3">
        <div className="fw-semibold" style={{ fontSize: 13 }}>Which columns matter?</div>
        <div className="text-muted" style={{ fontSize: 11 }}>
          Each choice shows a real value from the sheet, so you can see what you are picking.
        </div>
      </div>

      {sheets.length > 1 && (
        <Form.Group className="mb-3" style={{ maxWidth: 320 }}>
          <Form.Label className="d-flex align-items-center gap-1" style={{ fontSize: 11, fontWeight: 600 }}>
            <MaterialIcon name="table_chart" size={14} /> Sheet
          </Form.Label>
          <Form.Select size="sm" value={sheet} onChange={e => onSheet(e.target.value)} disabled={busy}
            style={{ fontSize: 12 }}>
            {sheets.map(s => <option key={s} value={s}>{s}</option>)}
          </Form.Select>
        </Form.Group>
      )}

      <div className="d-flex flex-column gap-2 mb-3">
        {FIELDS.map(f => {
          const value = map[f.key]
          const sample = sampleOf(rawRows, value)
          const isAuto = value && value === autoMap[f.key]
          const missing = f.required && !value
          return (
            <div key={f.key} className="px-2 py-2 rounded d-flex align-items-start gap-2"
              style={{
                background: missing ? '#fff5f5' : value ? '#f8f9fa' : '#fff',
                border: `1px solid ${missing ? '#f5c2c7' : '#e9ecef'}`,
              }}>
              <MaterialIcon name={f.icon} size={16}
                style={{ color: value ? '#0d6efd' : '#adb5bd', flexShrink: 0, marginTop: 2 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="d-flex align-items-center gap-2">
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{f.label}</span>
                  {f.required && <span className="text-danger" style={{ fontSize: 11 }}>required</span>}
                  {isAuto && (
                    <span className="rounded px-1" style={{ fontSize: 9, background: '#cfe2ff', color: '#084298' }}>
                      auto
                    </span>
                  )}
                </div>
                <div className="text-muted" style={{ fontSize: 10 }}>{f.hint}</div>

                {/* A read-only glance at the column, not a field. No box, no white
                    background — anything input-shaped invites a click. */}
                {value && (
                  <div className="mt-1 d-flex align-items-baseline gap-1" style={{ cursor: 'default' }}>
                    <MaterialIcon name="visibility" size={11} style={{ color: '#adb5bd', flexShrink: 0 }} />
                    <span className="text-muted" style={{ fontSize: 9, flexShrink: 0 }}>this column holds</span>
                    <span className="text-truncate" title={sample || '(every row is blank)'}
                      style={{ fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace', color: '#6c757d', minWidth: 0 }}>
                      {sample === '' || sample === null
                        ? <span className="fst-italic" style={{ fontFamily: 'inherit' }}>every row is blank</span>
                        : `“${sample}”`}
                    </span>
                  </div>
                )}
              </div>

              <Form.Select size="sm" value={value} style={{ fontSize: 11, width: 240, flexShrink: 0 }}
                onChange={e => set(f.key, e.target.value)}>
                <option value="">— none —</option>
                {options.map(h => <option key={h} value={h}>{h}</option>)}
              </Form.Select>
            </div>
          )
        })}
      </div>

      <div className="mb-1 d-flex align-items-center gap-1" style={{ fontSize: 11, fontWeight: 600 }}>
        <MaterialIcon name="notes" size={14} /> Context columns
        <span className="text-muted fw-normal" style={{ fontSize: 10 }}>
          — shown beside each field while you review, and again in the Side-by-Side pane
        </span>
      </div>
      <div className="d-flex flex-wrap gap-1 mb-3">
        {usefulHeaders.map(h => {
          const on = map.context.includes(h)
          return (
            <button key={h} type="button"
              className={`btn btn-sm ${on ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: 10, padding: '0 6px', borderRadius: 10 }}
              onClick={() => toggleContext(h)}
              title={sampleOf(rawRows, h) || h}>
              {h}
            </button>
          )
        })}
      </div>

      {/* What one row will look like when you review it. */}
      {preview && (
        <div className="px-2 py-2 mb-3 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
          <div className="fw-semibold text-muted mb-1" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            First row, as you will see it
          </div>
          <div className="d-flex align-items-baseline gap-2 flex-wrap" style={{ fontSize: 11 }}>
            {map.pt && <span className="rounded px-1" style={{ background: '#e7f1ff', fontFamily: 'monospace' }}>{String(preview[map.pt] ?? '—')}</span>}
            {map.mfr && <span className="text-muted">{String(preview[map.mfr] ?? '—')}</span>}
          </div>
          <div className="mt-1" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
            {String(preview[map.code])}
          </div>
          {map.context.length > 0 && (
            <div className="mt-1 text-muted" style={{ fontSize: 10 }}>
              {map.context.filter(c => preview[c] != null && String(preview[c]).trim() !== '')
                .map(c => `${c}: ${preview[c]}`).join('  ·  ')}
            </div>
          )}
        </div>
      )}

      <div className="d-flex align-items-center gap-2">
        <Button variant="primary" size="sm" disabled={!map.code || busy} onClick={onStart}>
          {map.pt ? 'Resolve PositionTypes →' : 'Start review →'}
        </Button>
        <span className="text-muted" style={{ fontSize: 11 }}>
          {rawRows.length} rows in “{sheet}”{skipped > 0 && <> · {skipped} excluded</>}
        </span>
        {!map.pt && (
          <span style={{ fontSize: 10, color: '#856404' }}>
            <MaterialIcon name="warning" size={11} /> Without a PositionType column nothing can be reconciled later.
          </span>
        )}
      </div>
    </div>
  )
}
