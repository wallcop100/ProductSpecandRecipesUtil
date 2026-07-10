import React, { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'
import { buildTasks } from '../utils/validationTasks'
import { formProgress } from '../utils/formSpec'
import { ignoredPositionRefs } from '../utils/positionFamily'
import { readiness, CLAUSE } from '../utils/readiness'

/**
 * ReadinessPanel — "Am I done?"
 *
 * Every part of the answer already existed, in four different places, and the user
 * assembled it by eye. Four clauses, each with a live count and the thing to click.
 *
 * There is deliberately no percentage. A fix queued in a patch script is discharged by
 * you and outstanding for Excel, and no single number can say both.
 */
export default function ReadinessPanel({ onOpenValidation, onOpenExport, onOpenPosition }) {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const positionUI = useStore(s => s.positionUI)
  const ignoredPositionFamilies = useStore(s => s.ignoredPositionFamilies)
  const formCaptures = useStore(s => s.formCaptures)
  const containerETRefs = useStore(s => s.containerETRefs)
  const validationResults = useStore(s => s.validationResults)
  const psChanges = useStore(s => s.psChanges)
  const rsChanges = useStore(s => s.rsChanges)
  const dbChanges = useStore(s => s.dbChanges)
  const alignmentGaps = useStore(s => s.alignmentGaps)

  const state = useMemo(() => {
    const tasks = buildTasks(validationResults, { psChanges, rsChanges, dbChanges })
    return readiness({
      positionTypes,
      recipes,
      ignoredPosRefs: ignoredPositionRefs({ positionTypes, positionUI, ignoredPositionFamilies }),
      formProgress: formProgress(recipes, formCaptures, containerETRefs),
      tasks,
      gaps: alignmentGaps(),
    })
  }, [positionTypes, recipes, positionUI, ignoredPositionFamilies, formCaptures,
      containerETRefs, validationResults, psChanges, rsChanges, dbChanges, alignmentGaps])

  const open = c => {
    if (c.key === CLAUSE.RECIPES && c.refs?.[0]) onOpenPosition?.(c.refs[0])
    else if (c.key === CLAUSE.VALIDATION) onOpenValidation?.()
    else if (c.key === CLAUSE.ALIGNMENT) onOpenExport?.()
  }

  return (
    <div className="p-3">
      <div className="fw-semibold small mb-2">Am I done?</div>

      <div className="mb-3 px-2 py-2 rounded" style={{
        background: state.done ? '#d1e7dd' : '#f8f9fa',
        border: `1px solid ${state.done ? '#a3cfbb' : '#e9ecef'}`,
        fontSize: 12,
      }}>
        {state.done
          ? <span style={{ color: '#0f5132' }}>
              <MaterialIcon name={ACTION_ICONS.complete} size={14} /> Nothing is left for you.
              {state.waiting > 0 && <> {state.waiting} thing{state.waiting === 1 ? '' : 's'} waiting on Excel — paste the patches.</>}
            </span>
          : <span className="text-muted">
              {state.blocking > 0
                ? <><span style={{ color: '#dc3545' }}>{state.blocking} item{state.blocking === 1 ? '' : 's'} block a correct patch.</span> Fix those first.</>
                : 'Not yet. The unfinished clauses are below.'}
            </span>}
      </div>

      {state.clauses.map(c => {
        const icon = c.notApplicable ? 'remove' : c.done ? ACTION_ICONS.complete : c.queued ? 'schedule' : 'radio_button_unchecked'
        const colour = c.notApplicable ? '#adb5bd' : c.done ? '#198754' : c.queued ? '#6c757d' : '#495057'
        const clickable = !c.done && !c.notApplicable

        return (
          <div key={c.key} className="d-flex align-items-start gap-2 py-2 border-bottom"
            style={{ fontSize: 12, cursor: clickable ? 'pointer' : 'default' }}
            onClick={() => clickable && open(c)}>
            <MaterialIcon name={icon} size={16} style={{ color: colour, flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: colour, fontWeight: c.done || c.notApplicable ? 400 : 600 }}>{c.label}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>{c.detail}</div>
            </div>
            {c.remaining > 0 && !c.queued && (
              <span className="rounded px-1" style={{ fontSize: 10, background: '#f1f3f5', color: '#495057', flexShrink: 0 }}>
                {c.remaining}
              </span>
            )}
          </div>
        )
      })}

      {state.done && state.waiting > 0 && (
        <Button variant="primary" size="sm" className="mt-3 w-100" style={{ fontSize: 11 }}
          onClick={() => onOpenExport?.()}>
          <MaterialIcon name="content_paste" size={13} /> Open the patch scripts
        </Button>
      )}
    </div>
  )
}
