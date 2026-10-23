import React from 'react'
import MaterialIcon from './MaterialIcon'
import { C } from '../styles/tokens'

/** One release from changelog.js as a card: version, tagline, highlights, then the smaller things. */
export default function WhatsNew({ release }) {
  const { version, date, tagline, highlights = [], also = [] } = release
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
      <div className="px-3 pt-2">
        {highlights.map(h => (
          <div key={h.title} className="d-flex gap-2 mb-2">
            <MaterialIcon name={h.icon} size={20} style={{ color: C.accent, marginTop: 1 }} />
            <div>
              <div className="fw-semibold" style={{ fontSize: 12, color: C.ink }}>{h.title}</div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{h.blurb}</div>
            </div>
          </div>
        ))}
      </div>
      {also.length > 0 && (
        <div className="px-3 pb-2 pt-1" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="fw-semibold mb-1" style={{ fontSize: 11, color: C.muted }}>Also in this release</div>
          <ul className="mb-0 ps-3" style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
            {also.map(a => <li key={a}>{a}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
