import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'

/**
 * atoms.jsx — the moving parts every tutorial scene shares.
 *
 * A scene is a pure function of `beat`: booleans derived from the beat toggle inline
 * `style={{ transition }}` (the QtyField idiom), and anything a transition cannot do uses
 * the one keyframe block below (the CaptureLines inline-<style> idiom). No animation
 * library — none exists in this app, and none is needed for a pointer that glides and a
 * ring that pulses.
 *
 * Nothing in this directory imports useStore. A scene that touched the live store could
 * corrupt the user's real project; a source-scan test enforces it.
 */

export const SCENE_KEYFRAMES = `
@keyframes tut-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(13,110,253,.45); }
  70%  { box-shadow: 0 0 0 7px rgba(13,110,253,0); }
  100% { box-shadow: 0 0 0 0 rgba(13,110,253,0); }
}
@keyframes tut-appear {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .tut-scene * { transition: none !important; animation: none !important; }
}
`

/** The stage every scene renders inside: fixed height so beats never resize the modal. */
export function Stage({ children, height = 210 }) {
  return (
    <div className="tut-scene position-relative rounded px-3 py-3"
      style={{ height, background: '#f8f9fa', border: '1px solid #e9ecef', overflow: 'hidden' }}>
      <style>{SCENE_KEYFRAMES}</style>
      {children}
    </div>
  )
}

/**
 * The fake pointer. Give it a position per beat and it glides there — one absolutely
 * positioned sprite whose left/top transition IS the animation.
 */
export function Cursor({ at, click = false }) {
  if (!at) return null
  return (
    <div style={{
      position: 'absolute', left: at.x, top: at.y, zIndex: 5, pointerEvents: 'none',
      transition: 'left .5s ease, top .5s ease',
    }}>
      <MaterialIcon name="near_me" size={18}
        style={{ color: '#212529', transform: 'scaleX(-1)', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.35))' }} />
      {click && (
        <span style={{
          position: 'absolute', left: -4, top: -4, width: 24, height: 24, borderRadius: '50%',
          animation: 'tut-pulse 1s ease-out infinite',
        }} />
      )}
    </div>
  )
}

/** Glow on the thing the blurb is talking about. */
export function Pulse({ on, children, style }) {
  return (
    <div style={{
      borderRadius: 6,
      animation: on ? 'tut-pulse 1.4s ease-out infinite' : 'none',
      ...style,
    }}>
      {children}
    </div>
  )
}

/** A row that exists from a given beat: slides in when its moment comes. */
export function Appear({ when, children }) {
  if (!when) return null
  return <div style={{ animation: 'tut-appear .35s ease-out both' }}>{children}</div>
}

/** A generic mini list row — position, recipe row, spec row — kept deliberately small. */
export function MiniRow({ active, dim, children, style }) {
  return (
    <div className="d-flex align-items-center gap-2 px-2 py-1 rounded mb-1"
      style={{
        background: active ? '#e7f1ff' : '#fff',
        border: `1px solid ${active ? '#b6d4fe' : '#e9ecef'}`,
        opacity: dim ? 0.45 : 1,
        fontSize: 11,
        transition: 'background .3s ease, opacity .3s ease, border-color .3s ease',
        ...style,
      }}>
      {children}
    </div>
  )
}

/** A coverage-matrix style status cell. */
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

/** The tiny caption under a scene naming what just happened (screen-reader friendly). */
export function Caption({ children }) {
  return (
    <div className="text-muted text-center mt-2" style={{ fontSize: 10 }} aria-live="polite">
      {children}
    </div>
  )
}
