import React, { useEffect, useState } from 'react'
import MaterialIcon from './MaterialIcon'
import { C } from '../styles/tokens'
import { useCompanion } from '../platform/companion'

/** One release from changelog.js as a card: version, tagline, one line per highlight, the smaller things folded. */
export default function WhatsNew({ release }) {
  const { version, date, tagline, highlights = [], also = [] } = release
  const [showAlso, setShowAlso] = useState(false)
  // Served with the companion ("Connected"): the card goes purple and companion-only highlights show.
  const companion = useCompanion()
  const ink = companion ? C.companion : C.accentInk
  const edge = companion ? C.companion : C.accentEdge
  return (
    <div className={`mb-3 rounded${companion ? ' companion-card' : ''}`} data-debug-id="WhatsNew"
      style={{ border: `1px solid ${C.accentEdge}`, background: C.surface, overflow: 'hidden' }}>
      <div className="px-3 py-2" style={{ background: companion ? 'transparent' : C.accentTint, borderBottom: `1px solid ${edge}` }}>
        <div className="d-flex align-items-baseline gap-2">
          <span className="fw-bold" style={{ color: ink, fontSize: 15 }}>{version}</span>
          <span className="ms-auto" style={{ color: C.muted, fontSize: 11 }}>{date}</span>
        </div>
        {tagline && <div style={{ color: ink, fontSize: 12 }}>{tagline}</div>}
      </div>
      <div className="px-3 py-2">
        {highlights.filter(h => companion || !h.companion).map(h => (
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

const SEEN = 'psr.whatsNewSeen'
const seenVersion = () => { try { return localStorage.getItem(SEEN) } catch { return null } }
/** Remember that this release was opened, so the teaser goes quiet until the next one. */
export function markSeen(version) { try { localStorage.setItem(SEEN, version) } catch { /* private window: shows again */ } }

/**
 * The strip under the start page's title that rolls through this release's headlines (356KWQ).
 * Shown until the release is opened once; purple and glistening with the companion.
 */
export function WhatsNewTeaser({ release, onOpen }) {
  const companion = useCompanion()
  const lines = [`${release.highlights.filter(h => companion || !h.companion).length} new things in ${release.version}`,
    ...release.highlights.filter(h => companion || !h.companion).map(h => h.title)]
  const [i, setI] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI(n => (n + 1) % lines.length), 2600)
    return () => clearInterval(t)
  }, [lines.length])
  if (seenVersion() === release.version) return null
  if (release.until && new Date().toISOString().slice(0, 10) >= release.until) return null
  const ink = companion ? C.companion : C.accentInk
  return (
    <button type="button" data-testid="whats-new-teaser" onClick={onOpen}
      className={`w-100 mb-2 d-flex align-items-center gap-2 rounded${companion ? ' companion-card' : ''}`}
      style={{ border: `1px dashed ${C.accentEdge}`, background: C.accentTint, color: ink, fontSize: 12, padding: '6px 10px', textAlign: 'left' }}>
      <MaterialIcon name="celebration" size={16} style={{ color: ink }} />
      <span className="whats-new-roll" style={{ flex: 1, minWidth: 0 }}>
        <span key={i} className="text-truncate d-block">{lines[i]}</span>
      </span>
      <span aria-label="Show details">▾</span>
    </button>
  )
}
