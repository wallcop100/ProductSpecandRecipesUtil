import React, { useEffect } from 'react'
import { BugReporter as Reporter, openReport, useOpened } from 'companion-kit'
import useStore from '../store/useStore'
import { buildReport, domContext, reportsToMarkdown } from '../utils/bugReports'
import { useCompanion } from '../platform/companion'
import { learnedInView } from '../platform/outcomes'
import { askConfirm } from './ConfirmHost'

/**
 * BugReporter — companion-kit's reporter (shared with the driver assignment tool) over this
 * app's store. The kit owns the bug at the bottom centre, the note, the ▾ and send-or-keep;
 * what a report holds is bugReports.js. Beside a companion a report also carries the project
 * and the learned values in view. Find (Ctrl+K) and a suggestion's ⋯ menu open the note
 * through requestBugNote.
 */
export default function BugReporter({ screen }) {
  const mode = useStore(s => s.bugMode)
  const setMode = useStore(s => s.setBugMode)
  const reports = useStore(s => s.bugReports)
  const setReports = useStore(s => s.setBugReports)
  const companion = useCompanion()
  useOpened(companion)

  const bugNoteRequest = useStore(s => s.bugNoteRequest)
  useEffect(() => { if (bugNoteRequest) openReport(useStore.getState().bugNoteTarget) }, [bugNoteRequest])

  const build = ({ note, kind, target, via, capture, trail, id, screen: at }) => buildReport({
    note, kind, target, via, capture, trail, id, screen: at, companion: !!companion, state: useStore.getState(),
  })
  const where = (target, via) => {
    const d = domContext(target)
    return [screen, d.dialogs.at(-1), d.areas[0], via ? `last clicked ${d.element}` : d.element].filter(Boolean).join(' · ')
  }
  const toRemote = r => {
    const learned = r.dom ? learnedInView([r.dom.code, ...(r.dom.refs || []), r.app?.elementType]) : []
    return { ...r, project: useStore.getState().projectNumber || null, ...(learned.length ? { learned } : {}) }
  }

  return (
    <Reporter screen={screen} build={build} where={where} toRemote={toRemote} toMarkdown={reportsToMarkdown}
      send={companion?.report || undefined} confirm={m => askConfirm(m, { ok: 'Delete', danger: true })}
      reports={reports} setReports={setReports} mode={mode} setMode={setMode} />
  )
}
