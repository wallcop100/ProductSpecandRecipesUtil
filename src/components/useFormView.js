import { useMemo } from 'react'
import useStore from '../store/useStore'
import { applyFormNotes } from '../utils/formNotes'

/**
 * The import draft and captures as Form Template Notes say to read them (NAL5HU): wrong
 * codes corrected, not-needed codes and set-aside entries out. For READING only; anything
 * that writes the draft or the captures uses the store's own.
 */
export default function useFormView() {
  const importDraft = useStore(s => s.importDraft)
  const formCaptures = useStore(s => s.formCaptures)
  const psRows = useStore(s => s.psRows)
  const formNotes = useStore(s => s.formNotes)
  return useMemo(() => applyFormNotes({ importDraft, formCaptures, psRows }, formNotes),
    [importDraft, formCaptures, psRows, formNotes])
}
