import React, { useEffect } from 'react'
import { BugReporter as Reporter, openReport, useOpened } from 'companion-kit'
import useStore from '../store/useStore'
import { buildReport, domContext, reportsToMarkdown, appContext } from '../utils/bugReports'
import { buildSnapshot, uploadSnapshot, replayOn } from '../platform/replay'
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
const TICKS = [{ key: 'replay', label: 'Include my data (replay)',
  title: 'Sends the workbooks as you have them, your unexported work and this view, so the same screen can be opened to fix it. Dev only, kept until 30 days after the report is resolved.' }]

/** The view a replay lands on: where you were, the drawer, the open dialogs, the rail filter. */
export function viewOf(state, screen, target) {
  const { position, elementType } = appContext(state, screen)
  return { screen: screen || null, position, elementType, drawerOpen: !!state.drawerOpen, drawerTab: state.drawerTab || null,
    positionQuery: state.positionQuery || '', dialogs: target ? domContext(target).dialogs : [] }
}

export default function BugReporter({ screen }) {
  const mode = useStore(s => s.bugMode)
  const setMode = useStore(s => s.setBugMode)
  const reports = useStore(s => s.bugReports)
  const setReports = useStore(s => s.setBugReports)
  const companion = useCompanion()
  useOpened(companion)

  const bugNoteRequest = useStore(s => s.bugNoteRequest)
  useEffect(() => { if (bugNoteRequest) openReport(useStore.getState().bugNoteTarget) }, [bugNoteRequest])

  // Dev only, beside a bridge that keeps them: "Include my data (replay)" (DEV_REPORTS_PLAN.md).
  const replay = replayOn() && !!companion?.snapshots
  const views = React.useRef(new Map())   // report id → the view when it was written, for its snapshot
  const build = ({ note, kind, target, via, capture, trail, id, screen: at, ticks }) => {
    const r = buildReport({ note, kind, target, via, capture, trail, id, screen: at, companion: !!companion, state: useStore.getState() })
    if (!(replay && ticks?.replay)) return r
    views.current.set(r.id, viewOf(useStore.getState(), at, target))
    return { ...r, snapshot: true }
  }
  const send = companion?.report && (async payload => {
    const got = await companion.report(payload)
    const ui = views.current.get(payload.id)
    views.current.delete(payload.id)
    // on its own after the report: a failed upload still leaves the report
    if (got?.id && payload.snapshot) uploadSnapshot(got.id, await buildSnapshot({ report: payload, ui }))
    return got
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
      send={send || undefined} ticks={replay ? TICKS : []} confirm={m => askConfirm(m, { ok: 'Delete', danger: true })}
      reports={reports} setReports={setReports} mode={mode} setMode={setMode} />
  )
}
