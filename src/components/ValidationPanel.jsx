import React, { useState } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'

/**
 * ValidationPanel — lists validation issues; each links to where it's fixed
 * (position editor for recipe rules, Product Spec for spec rules).
 *
 * Props:
 *   onOpenProductSpec(etRef) — open the Product Spec screen for a spec issue
 *   onOpenFixer()            — open the step-through fixer modal
 */
export default function ValidationPanel({ onOpenProductSpec, onOpenFixer }) {
  const validationResults = useStore(s => s.validationResults)
  const runValidation     = useStore(s => s.runValidation)
  const focusPosition     = useStore(s => s.focusPosition)

  const [specOpen, setSpecOpen] = useState(false)

  const specWarnings    = validationResults.filter(i => i.rule === 'MISSING_PRODUCT_CODE')
  const recipeIssues    = validationResults.filter(i => i.rule !== 'MISSING_PRODUCT_CODE')
  const errors          = recipeIssues.filter(i => i.severity === 'error')
  const recipeWarnings  = recipeIssues.filter(i => i.severity === 'warning')

  function goFix(issue) {
    if (!issue?.ref) return
    if (issue.fixKind === 'spec') onOpenProductSpec?.(issue.ref)
    else focusPosition(issue.ref)
  }

  return (
    <div className="p-3">
      <div className="d-flex align-items-center gap-2 mb-3">
        <span className="fw-semibold small">Validation</span>
        <Button
          variant="outline-primary"
          size="sm"
          style={{ fontSize: 11, padding: '1px 8px' }}
          onClick={() => runValidation()}
        >
          Run
        </Button>
        {validationResults.length > 0 && (
          <Button
            variant="outline-secondary" size="sm"
            className="d-inline-flex align-items-center gap-1"
            style={{ fontSize: 11, padding: '1px 8px' }}
            onClick={() => onOpenFixer?.()}
            title="Step through issues one at a time"
          >
            <MaterialIcon name={ACTION_ICONS.review} size={13} /> Fix issues
          </Button>
        )}
      </div>

      {validationResults.length === 0 && (
        <div className="text-muted small">No validation results yet. Click Run to validate.</div>
      )}

      {errors.length > 0 && (
        <div className="mb-3">
          <div className="text-uppercase fw-bold mb-1" style={{ fontSize: 10, color: '#dc3545', letterSpacing: 0.5 }}>
            Errors ({errors.length})
          </div>
          {errors.map((issue, i) => (
            <IssueRow key={i} issue={issue} onFix={goFix} />
          ))}
        </div>
      )}

      {recipeWarnings.length > 0 && (
        <div className="mb-3">
          <div className="text-uppercase fw-bold mb-1" style={{ fontSize: 10, color: '#997404', letterSpacing: 0.5 }}>
            Warnings ({recipeWarnings.length})
          </div>
          {recipeWarnings.map((issue, i) => (
            <IssueRow key={i} issue={issue} onFix={goFix} />
          ))}
        </div>
      )}

      {/* Spec health — collapsible, not mixed with recipe issues */}
      {specWarnings.length > 0 && (
        <div className="mb-3">
          <div
            className="d-flex align-items-center gap-1 mb-1"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setSpecOpen(v => !v)}
          >
            <MaterialIcon name={specOpen ? ACTION_ICONS.expand : ACTION_ICONS.collapse} size={13} style={{ width: 13 }} />
            <div className="text-uppercase fw-bold" style={{ fontSize: 10, color: '#997404', letterSpacing: 0.5 }}>
              Spec health ({specWarnings.length})
            </div>
          </div>
          {specOpen && specWarnings.map((issue, i) => (
            <IssueRow key={i} issue={issue} onFix={goFix} />
          ))}
        </div>
      )}

      {validationResults.length > 0 && errors.length === 0 && recipeWarnings.length === 0 && specWarnings.length === 0 && (
        <div className="text-success small d-inline-flex align-items-center gap-1"><MaterialIcon name={ACTION_ICONS.complete} size={14} /> No issues found.</div>
      )}
    </div>
  )
}

function IssueRow({ issue, onFix }) {
  const isError = issue.severity === 'error'
  const icon  = isError ? 'error' : 'warning'
  const color = isError ? '#dc3545' : '#997404'
  const fixLabel = issue.fixKind === 'spec' ? 'Open in Product Spec' : `Go to ${issue.ref}`

  return (
    <div
      className="mb-2 p-2 rounded"
      style={{
        background: isError ? '#fff5f5' : '#fffbe6',
        border: `1px solid ${isError ? '#f5c2c7' : '#ffd677'}`,
        cursor: issue.ref ? 'pointer' : 'default',
        fontSize: 12,
      }}
      onClick={() => onFix(issue)}
      title={issue.ref ? fixLabel : ''}
    >
      <div className="d-flex align-items-start gap-1">
        <MaterialIcon name={icon} size={15} style={{ color, flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600, color }}>{issue.rule}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>{issue.message}</div>
          {issue.ref && (
            <div className="d-flex align-items-center gap-1" style={{ fontSize: 10, color: '#0d6efd', marginTop: 2 }}>
              <MaterialIcon name={issue.fixKind === 'spec' ? ACTION_ICONS.productSpec : 'subdirectory_arrow_right'} size={11} /> {fixLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
