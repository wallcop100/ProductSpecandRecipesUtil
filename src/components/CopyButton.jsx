import React, { useState } from 'react'
import IconButton from './IconButton'
import { C } from '../styles/tokens'

/**
 * CopyButton — copy a value (a product code, usually) to the clipboard, and say so.
 * Checking a spec means pasting codes into a maker's site; retyping them invites typos.
 */
/** Put text on the clipboard; true when it got there. */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(String(text ?? '')); return true } catch { return false }
}

/**
 * CopyText — the text itself copies on click, with no icon (43B4AM): a brief tint says it worked.
 */
export function CopyText({ text, children, style }) {
  const [done, setDone] = useState(false)
  async function copy(e) {
    e.stopPropagation()
    if (await copyText(text)) { setDone(true); setTimeout(() => setDone(false), 1200) }
  }
  return (
    <span role="button" tabIndex={0} title={done ? 'Copied' : 'Click to copy'} data-copied={done || undefined}
      onClick={copy} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(e) } }}
      style={{ cursor: 'copy', borderRadius: 3, background: done ? C.accentTint : undefined, transition: 'background .2s', ...style }}>
      {children ?? text}
    </span>
  )
}

export default function CopyButton({ text, what = 'code', size = 12, style }) {
  const [done, setDone] = useState(false)
  async function copy(e) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(String(text ?? ''))
      setDone(true)
      setTimeout(() => setDone(false), 1200)
    } catch { /* clipboard unavailable: nothing to do */ }
  }
  return (
    <IconButton icon={done ? 'check' : 'content_copy'} size={size}
      title={done ? 'Copied' : `Copy ${what}`} onClick={copy}
      style={{ padding: 0, color: done ? C.success : C.faint, ...style }} />
  )
}
