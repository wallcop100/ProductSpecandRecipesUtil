import { useEffect } from 'react'
import useStore from '../store/useStore'

const editable = el => !!el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable)

/**
 * UndoShortcut — Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo, on every screen that
 * edits the project (not Import, which has its own undo, nor folder setup).
 *
 * In a text field the browser's own undo wins while you are typing there. But a field you
 * have only clicked into has nothing of its own to undo, so the shortcut undoes the
 * project's last change — the one that field just saved on blur.
 */
export default function UndoShortcut({ screen }) {
  useEffect(() => {
    if (screen === 'product-code-import' || screen === 'folder-setup') return undefined
    const onFocus = new WeakMap()
    const focusin = e => { if (editable(e.target) && 'value' in e.target) onFocus.set(e.target, e.target.value) }
    const keydown = e => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      const isUndo = k === 'z' && !e.shiftKey
      const isRedo = (k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)
      if (!isUndo && !isRedo) return
      const el = document.activeElement
      if (editable(el) && (!onFocus.has(el) || el.value !== onFocus.get(el) || el.tagName === 'SELECT')) return
      if (editable(el)) el.blur()
      e.preventDefault()
      const s = useStore.getState()
      if (isUndo) s.undo(); else s.redo()
    }
    document.addEventListener('focusin', focusin, true)
    window.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('focusin', focusin, true); window.removeEventListener('keydown', keydown) }
  }, [screen])
  return null
}
