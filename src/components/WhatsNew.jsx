import React, { useState } from 'react'
import MaterialIcon from './MaterialIcon'
import { C } from '../styles/tokens'

/** One release from changelog.js as a card: version, tagline, one line per highlight, the smaller things folded. */
export default function WhatsNew({ release }) {
  const { version, date, tagline, highlights = [], also = [] } = release
  const [showAlso, setShowAlso] = useState(false)
  return (
    <div className="mb-3 rounded" data-debug-id="WhatsNew"
      style={{ border: `1px solid ${C.accentEdge}`, background: C.surface, overflow: 'hidden' }}>
      <div className="px-3 py-2" style={{ background: C.accentTint, borderBottom: `1px solid ${C.accentEdge}` }}>
        <div className="d-flex align-items-baseline gap-2">
          <span className="fw-bold" style={{ color: C.accentInk, fontSize: 15 }}>{version}</span>
          <span className="ms-auto" style={{ color: C.muted, fontSize: 11 }}>{date}</span>
        </div>
        {tagline && <div style={{ color: C.accentInk, fontSize: 12 }}>{tagline}</div>}
      </div>
      <div className="px-3 py-2">
        {highlights.map(h => (
          <div key={h.title} className="d-flex gap-2" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 4 }}>
            <MaterialIcon name={h.icon} size={16} style={{ color: C.accent, marginTop: 1 }} />
            <div>
              <span className="fw-semibold" style={{ color: C.ink }}>{h.title}</span>
              <span style={{ color: C.muted }}> · {h.blurb}</span>
            </div>
          </div>
        ))}
        {also.length > 0 && (
          <>
            <button className="btn btn-link p-0 text-muted" style={{ fontSize: 11 }}
              onClick={() => setShowAlso(v => !v)}>
              {showAlso ? 'Hide' : `${also.length} more`} {showAlso ? '▴' : '▾'}
            </button>
            {showAlso && (
              <ul className="mb-0 mt-1 ps-3" style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                {also.map(a => <li key={a}>{a}</li>)}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
