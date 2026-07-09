import React, { useMemo } from 'react'
import { Button, Form } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import { VIA } from '../utils/ptResolve'

/**
 * ResolveRefsStep — where a Form ref becomes a project PositionType.
 *
 * The Form names things as the drawings do; the DesignDB may hold a different
 * PositionType for the same thing, and say so via ExtRef (C01r.ExtRef = "C01").
 * The recipe belongs to the DB's ref, not the Form's, so this step is what stops
 * captured codes prefilling a PositionType that will never carry a recipe.
 *
 * Nothing is inferred from names. Every redirect shown here was read out of the
 * DB; anything the DB is silent about is left to the user, and skipping is always
 * allowed — a skipped ref simply prefills no recipe.
 */

const STYLE = {
  [VIA.EXT_REF]: { bg: '#cfe2ff', fg: '#084298', icon: 'alt_route', label: 'via ExtRef' },
  [VIA.DIRECT]: { bg: '#d1e7dd', fg: '#0f5132', icon: 'check', label: 'direct' },
  [VIA.MISSING]: { bg: '#f8d7da', fg: '#842029', icon: 'help', label: 'not in DB' },
}

export default function ResolveRefsStep({ resolutions, overrides, onOverride, positionTypes, onBack, onConfirm }) {
  const ptRefs = useMemo(
    () => positionTypes.map(p => p.PositionTypeRef || p.positionTypeRef).filter(Boolean).sort(),
    [positionTypes]
  )

  const effective = r => (overrides[r.formRef] === undefined ? r.target || '' : overrides[r.formRef])
  const counts = resolutions.reduce((a, r) => {
    const t = effective(r)
    if (!t) a.skipped++
    else if (r.via === VIA.EXT_REF && t === r.target) a.redirected++
    else a.mapped++
    return a
  }, { redirected: 0, mapped: 0, skipped: 0 })

  const redirects = resolutions.filter(r => r.via === VIA.EXT_REF)
  const ambiguous = resolutions.filter(r => r.ambiguous.length > 0)

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      <div className="mb-2">
        <div className="fw-semibold" style={{ fontSize: 13 }}>Resolve the Form's PositionTypes</div>
        <div className="text-muted" style={{ fontSize: 11 }}>
          Recipes hang off the DesignDB's PositionType, which is not always the one the Form names.
          Where a PositionType declares this ref as its <code>ExtRef</code>, it is the real target.
        </div>
      </div>

      {redirects.length > 0 && (
        <div className="px-2 py-1 mb-2 rounded" style={{ background: '#cfe2ff', color: '#084298', fontSize: 11 }}>
          <MaterialIcon name="alt_route" size={12} />{' '}
          {redirects.length} ref{redirects.length === 1 ? '' : 's'} redirect to a different PositionType, because the
          DesignDB says so:{' '}
          <span style={{ fontFamily: 'monospace' }}>
            {redirects.slice(0, 4).map(r => `${r.formRef}→${r.target}`).join(', ')}
            {redirects.length > 4 && ` +${redirects.length - 4} more`}
          </span>
        </div>
      )}

      {ambiguous.length > 0 && (
        <div className="px-2 py-1 mb-2 rounded" style={{ background: '#fff3cd', color: '#856404', fontSize: 11 }}>
          <MaterialIcon name="warning" size={12} /> More than one PositionType claims the same ExtRef — pick the right
          one: {ambiguous.map(r => r.formRef).join(', ')}
        </div>
      )}

      <div className="border rounded" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 1 }}>
            <tr>
              <th style={{ width: 120 }}>Form ref</th>
              <th style={{ width: 55 }}>Rows</th>
              <th style={{ width: 110 }}>How</th>
              <th>Recipe target</th>
            </tr>
          </thead>
          <tbody>
            {resolutions.map(r => {
              const s = STYLE[r.via]
              const value = effective(r)
              return (
                <tr key={r.formRef} style={{ opacity: value ? 1 : 0.55 }}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.formRef}</td>
                  <td className="text-muted">{r.rows}</td>
                  <td>
                    <span className="rounded px-1 d-inline-flex align-items-center gap-1"
                      style={{ background: s.bg, color: s.fg, fontSize: 10 }}>
                      <MaterialIcon name={s.icon} size={10} /> {s.label}
                    </span>
                  </td>
                  <td>
                    <Form.Select size="sm" value={value} style={{ fontSize: 11, fontFamily: 'monospace' }}
                      onChange={e => onOverride(r.formRef, e.target.value)}>
                      <option value="">— skip, prefill nothing —</option>
                      {ptRefs.map(p => (
                        <option key={p} value={p}>
                          {p}{p === r.target && r.via === VIA.EXT_REF ? '  (via ExtRef)' : ''}
                        </option>
                      ))}
                    </Form.Select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="d-flex align-items-center gap-2 mt-2">
        <Button size="sm" variant="outline-secondary" onClick={onBack}>← Back</Button>
        <Button size="sm" variant="primary" onClick={onConfirm}>Start review →</Button>
        <span className="text-muted" style={{ fontSize: 11 }}>
          {counts.redirected} redirected · {counts.mapped} direct · {counts.skipped} skipped
        </span>
      </div>
    </div>
  )
}
