import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'

/**
 * atoms.jsx — the moving parts every tutorial scene shares.
 *
 * A scene is a pure function of `beat`: booleans derived from the beat toggle inline
 * `style={{ transition }}` (the QtyField idiom), and anything a transition cannot do uses
 * the keyframes below (the CaptureLines inline-<style> idiom). No animation library — none
 * exists here, and none is needed for a ring that pulses and a pointer that appears.
 *
 * THE CURSOR IS ANCHORED, NOT POSITIONED. It used to be one absolutely-placed sprite driven
 * by hand-written {x, y} per beat, and it pointed at the wrong thing in almost every scene —
 * a scene's layout changes and the coordinates silently rot. `<Click on={…}>` wraps the
 * element being acted on and draws the pointer at ITS corner, so the pointer is correct by
 * construction and cannot drift.
 *
 * Nothing in this directory imports useStore.
 */

export const SCENE_KEYFRAMES = `
@keyframes tut-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(13,110,253,.45); }
  70%  { box-shadow: 0 0 0 7px rgba(13,110,253,0); }
  100% { box-shadow: 0 0 0 0 rgba(13,110,253,0); }
}
@keyframes tut-ripple {
  0%   { transform: scale(.4); opacity: .55; }
  100% { transform: scale(1.6); opacity: 0; }
}
@keyframes tut-appear {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .tut-scene * { transition: none !important; animation: none !important; }
}
`

/** The stage every scene renders inside. Fixed height so beats never resize the modal. */
export function Stage({ children, height = 230 }) {
  return (
    <div className="tut-scene position-relative rounded px-3 py-3"
      style={{ height, background: '#f8f9fa', border: '1px solid #e9ecef', overflow: 'hidden' }}>
      <style>{SCENE_KEYFRAMES}</style>
      {children}
    </div>
  )
}

/**
 * Click — the pointer, anchored to the thing it is clicking.
 *
 * Wrap the element the beat acts on. When `on`, a ripple and a cursor appear at that
 * element's own bottom-right, wherever it happens to be. No coordinates to get wrong.
 */
export function Click({ on, children, style }) {
  return (
    <span className="position-relative d-inline-flex" style={style}>
      {children}
      {on && (
        <>
          <span aria-hidden style={{
            position: 'absolute', right: -6, bottom: -6, width: 20, height: 20, borderRadius: '50%',
            background: 'rgba(13,110,253,.5)', animation: 'tut-ripple 1.1s ease-out infinite',
            pointerEvents: 'none', zIndex: 4,
          }} />
          <MaterialIcon name="near_me" size={16} aria-hidden style={{
            position: 'absolute', right: -11, bottom: -11, zIndex: 5, color: '#212529',
            transform: 'scaleX(-1)', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.35))',
            pointerEvents: 'none',
          }} />
        </>
      )}
    </span>
  )
}

/** Glow on the thing the blurb is talking about. */
export function Pulse({ on, children, style, className }) {
  return (
    <div className={className} style={{
      borderRadius: 6,
      animation: on ? 'tut-pulse 1.4s ease-out infinite' : 'none',
      ...style,
    }}>
      {children}
    </div>
  )
}

/** Something that arrives at a given beat. */
export function Appear({ when, children }) {
  if (!when) return null
  return <div style={{ animation: 'tut-appear .35s ease-out both' }}>{children}</div>
}

/**
 * FamilyHeader — a real tree family header: chevron · THE FAMILY REF · (count) · Ignore family.
 *
 * The header shows the family's REF (DOWNLIGHT, LINEAR-HL-ARCHITECTURAL) — that is what the
 * tree groups by (positionFamilyOf = ParentRef), not a friendly name.
 */
export function FamilyHeader({ family, count }) {
  return (
    <div className="d-flex align-items-center gap-1 px-1 py-1" style={{ fontSize: 9 }}>
      <MaterialIcon name="expand_more" size={12} style={{ color: '#6c757d' }} />
      <span className="fw-bold text-uppercase" style={{ fontSize: 8, letterSpacing: '.04em' }}>{family}</span>
      <span className="text-muted" style={{ fontSize: 8 }}>({count})</span>
      <div className="flex-grow-1" />
      <span className="d-inline-flex align-items-center gap-1 text-muted" style={{ fontSize: 8 }}>
        <MaterialIcon name="do_not_disturb_on" size={9} /> Ignore family
      </span>
    </div>
  )
}

/**
 * PositionRow — a replica of a real tree row (ProjectTreeView):
 *   icon · ref · [Ignore badge] · spacer · row-count/empty · ignore toggle · chevron
 *
 * NO description. The DesignDB leaves PositionType.Name blank, and the row only prints a
 * name when there IS one — so in real life a row is just the ref. The first version of this
 * scene invented a description column that the app does not have.
 */
export function PositionRow({ posRef, rows, ignored, active, clickIgnore, clickRow }) {
  return (
    <Click on={clickRow} style={{ width: '100%' }}>
      <div className="d-flex align-items-center gap-2 px-2 py-1 mb-1" style={{
        width: '100%',
        border: '1px solid #e5e7eb',
        borderLeft: '3px solid #6f42c1',
        borderRadius: 6,
        background: active ? '#e7f1ff' : '#fff',
        opacity: ignored ? 0.55 : 1,
        transition: 'opacity .3s ease, background .3s ease',
        fontSize: 11,
      }}>
        <MaterialIcon name="tab_unselected" size={14} style={{ color: '#6f42c1' }} />
        <span className="fw-semibold" style={{ fontSize: 11 }}>{posRef}</span>
        {ignored && (
          <span className="badge" style={{ background: '#fff3cd', color: '#856404', fontSize: 8, border: '1px solid #ffc107' }}>
            Ignore
          </span>
        )}
        <div className="flex-grow-1" />
        {rows > 0
          ? <span className="badge bg-light text-dark border" style={{ fontSize: 8 }}>{rows} rows</span>
          : <span className="text-muted fst-italic" style={{ fontSize: 9 }}>empty</span>}
        <Click on={clickIgnore}>
          <MaterialIcon name={ignored ? 'do_not_disturb_on' : 'do_not_disturb_off'} size={14}
            style={{ color: ignored ? '#ffc107' : '#ccc', transition: 'color .3s ease' }} />
        </Click>
        <MaterialIcon name="chevron_right" size={14} className="text-muted" />
      </div>
    </Click>
  )
}

/** A generic small row for the scenes that are not replicating a specific component. */
export function MiniRow({ active, dim, children, style }) {
  return (
    <div className="d-flex align-items-center gap-2 px-2 py-1 rounded mb-1"
      style={{
        background: active ? '#e7f1ff' : '#fff',
        border: `1px solid ${active ? '#b6d4fe' : '#e9ecef'}`,
        opacity: dim ? 0.45 : 1,
        fontSize: 10,
        transition: 'background .3s ease, opacity .3s ease, border-color .3s ease',
        ...style,
      }}>
      {children}
    </div>
  )
}

/** A coverage-matrix status cell. */
export function MiniCell({ status }) {
  const bg = { complete: '#d1e7dd', partial: '#fff3cd', missing: '#f8d7da', na: '#f8f9fa' }[status] || '#f8f9fa'
  const icon = { complete: 'check_circle', partial: 'warning', missing: 'cancel', na: 'remove' }[status] || 'remove'
  const fg = { complete: '#198754', partial: '#856404', missing: '#842029', na: '#adb5bd' }[status] || '#adb5bd'
  return (
    <div className="d-flex align-items-center justify-content-center rounded"
      style={{ width: 34, height: 24, background: bg, transition: 'background .3s ease' }}>
      <MaterialIcon name={icon} size={13} style={{ color: fg }} />
    </div>
  )
}

/** The caption under a scene, naming what just happened. */
export function Caption({ children }) {
  return (
    <div className="text-muted text-center mt-2" style={{ fontSize: 10 }} aria-live="polite">
      {children}
    </div>
  )
}
