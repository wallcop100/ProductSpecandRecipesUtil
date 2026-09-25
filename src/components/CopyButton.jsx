import React, { useState } from 'react'
import IconButton from './IconButton'

/**
 * CopyButton — copy a value (a product code, usually) to the clipboard, and say so.
 * Checking a spec means pasting codes into a maker's site; retyping them invites typos.
 */
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
      style={{ padding: 0, color: done ? '#198754' : '#adb5bd', ...style }} />
  )
}
