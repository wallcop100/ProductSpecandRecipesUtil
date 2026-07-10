import React, { useState, useMemo } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'
import { buildTasks, taskSummary, taskLabel } from '../utils/validationTasks'

/**
 * ValidationPanel — the work, not the wreckage.
 *
 * This listed 59 issues on the real project, of which 57 were fixed by two buttons.
 * It now lists the ACTIONS that resolve them: 3 tasks, detail folded underneath, the
 * blocking one first, and anything already queued for export sunk to the bottom in a
 * third state that is neither red nor gone.
 *
 * Props:
 *   onOpenProductSpec(etRef) — open the Product Spec screen for a spec issue
 *   onOpenFixer()            — open the step-through fixer modal
 */
export default function ValidationPanel({ onOpenProductSpec, onOpenFixer }) {
  const validationResults = useStore(s => s.validationResults)
  const runValidation     = useStore(s => s.runValidation)
  const focusPosition     = useStore(s => s.focusPosition)
  const psChanges         = useStore(s => s.psChanges)
  const rsChanges         = useStore(s => s.rsChanges)
  const dbChanges         = useStore(s => s.dbChanges)
  const fillWrapperSpecRows = useStore(s => s.fillWrapperSpecRows)
  const queueMissingDbRows  = useStore(s => s.queueMissingDbRows)

  const [open, setOpen] = useState(() => new Set())

  const tasks = useMemo(
    () => buildTasks(validationResults, { psChanges, rsChanges, dbChanges }),
    [validationResults, psChanges, rsChanges, dbChanges]
  )
  const summary = taskSummary(tasks)

  const toggle = key => setOpen(s => {
    const next = new Set(s)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  function goFix(item) {
    if (!item?.ref) return
    if (item.fixKind === 'spec' || item.rule.startsWith('MISSING_PRODUCT') ||
        item.rule === 'ELEMENT_TYPE_NOT_IN_DB' || item.rule === 'DUPLICATE_PRODUCT_CODE') {
      onOpenProductSpec?.(item.ref)
    } else {
      focusPosition(item.ref)
    }
  }

  /** The bulk button mutates the store; validation must be re-derived from it. */
  function runAction(action) {
    if (action === 'fillWrapperSpecRows') fillWrapperSpecRows()
    else if (action === 'queueMissingDbRows') queueMissingDbRows()
    runValidation()
  }

  return (
    <div className="p-3">
      <div className="d-flex align-items-center gap-2 mb-3">
        <span className="fw-semibold small">Validation</span>
        <Button variant="outline-primary" size="sm" style={{ fontSize: 11, padding: '1px 8px' }}
          onClick={() => runValidation()}>
          Run
        </Button>
        {summary.issues > 0 && (
          <Button variant="outline-secondary" size="sm"
            className="d-inline-flex align-items-center gap-1"
            style={{ fontSize: 11, padding: '1px 8px' }}
            onClick={() => onOpenFixer?.()}
            title="Step through issues one at a time">
            <MaterialIcon name={ACTION_ICONS.review} size={13} /> Step through
          </Button>
        )}
      </div>

      {validationResults.length === 0 && (
        <div className="text-muted small">No validation results yet. Click Run to validate.</div>
      )}

      {/* The headline: how many things must you DO, and does anything stop a correct patch? */}
      {tasks.length > 0 && (
        <div className="mb-2 text-muted" style={{ fontSize: 11 }}>
          {summary.open === 0
            ? <span className="text-success"><MaterialIcon name={ACTION_ICONS.complete} size={13} /> Nothing left to do — {summary.queued} task{summary.queued === 1 ? '' : 's'} waiting on Excel.</span>
            : <>{summary.open} task{summary.open === 1 ? '' : 's'} · {summary.issues} item{summary.issues === 1 ? '' : 's'}
                {summary.blocking > 0 && <span style={{ color: '#dc3545' }}> · {summary.blocking} blocks a correct patch</span>}</>}
        </div>
      )}

      {tasks.map(task => (
        <TaskRow key={task.key} task={task} expanded={open.has(task.key)}
          onToggle={() => toggle(task.key)} onAction={runAction} onFix={goFix} />
      ))}

      {validationResults.length > 0 && tasks.length === 0 && (
        <div className="text-success small d-inline-flex align-items-center gap-1">
          <MaterialIcon name={ACTION_ICONS.complete} size={14} /> No issues found.
        </div>
      )}
    </div>
  )
}

/**
 * One task: what to do, how many, and the detail folded away. Colour carries meaning —
 * red only when a pasted patch would be wrong, grey once the fix is queued.
 */
function TaskRow({ task, expanded, onToggle, onAction, onFix }) {
  const style = task.queued
    ? { bg: '#f8f9fa', border: '#e9ecef', fg: '#6c757d', icon: 'schedule' }
    : task.blocking
      ? { bg: '#fff5f5', border: '#f5c2c7', fg: '#dc3545', icon: 'error' }
      : { bg: '#fffbe6', border: '#ffd677', fg: '#997404', icon: 'warning' }

  return (
    <div className="mb-2 rounded" style={{ background: style.bg, border: `1px solid ${style.border}` }}>
      <div className="d-flex align-items-center gap-2 p-2" style={{ cursor: 'pointer' }} onClick={onToggle}>
        <MaterialIcon name={expanded ? ACTION_ICONS.expand : ACTION_ICONS.collapse} size={13}
          style={{ width: 13, flexShrink: 0, color: style.fg }} />
        <MaterialIcon name={style.icon} size={15} style={{ color: style.fg, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: style.fg }}>
            {task.count} {taskLabel(task)}
          </div>
          {task.hint && !task.queued && (
            <div className="text-muted" style={{ fontSize: 10 }}>{task.hint}</div>
          )}
          {task.queued && (
            <div className="text-muted" style={{ fontSize: 10 }}>
              Queued for export. The workbook learns about it when you paste the patch.
            </div>
          )}
        </div>
        {task.action && !task.queued && (
          <Button size="sm" variant="outline-primary" style={{ fontSize: 10, padding: '1px 8px', flexShrink: 0 }}
            onClick={e => { e.stopPropagation(); onAction(task.action) }}>
            Fix all {task.count}
          </Button>
        )}
      </div>

      {expanded && (
        <div className="px-2 pb-2">
          {task.items.map((item, i) => (
            <div key={`${item.ref}-${i}`}
              className="d-flex align-items-baseline gap-2 py-1 border-top"
              style={{ fontSize: 11, cursor: item.ref ? 'pointer' : 'default', opacity: item.queued ? 0.6 : 1 }}
              onClick={() => onFix(item)}
              title={item.message}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{item.ref}</span>
              {item.queued && <span className="text-muted" style={{ fontSize: 9 }}>queued</span>}
              <span className="text-muted text-truncate ms-auto" style={{ minWidth: 0 }}>{item.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
