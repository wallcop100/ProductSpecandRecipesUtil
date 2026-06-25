import React from 'react'
import { Button, Badge } from 'react-bootstrap'
import useStore from '../store/useStore'

/**
 * ValidationPanel — shows validation issues; clicking navigates to the affected position.
 */
export default function ValidationPanel() {
  const validationResults = useStore(s => s.validationResults)
  const runValidation = useStore(s => s.runValidation)
  const setActivePosition = useStore(s => s.setActivePosition)

  const errors = validationResults.filter(i => i.severity === 'error')
  const warnings = validationResults.filter(i => i.severity === 'warning')

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
      </div>

      {validationResults.length === 0 && (
        <div className="text-muted small">
          No validation results yet. Click Run to validate.
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-3">
          <div className="text-uppercase fw-bold mb-1" style={{ fontSize: 10, color: '#dc3545', letterSpacing: 0.5 }}>
            Errors ({errors.length})
          </div>
          {errors.map((issue, i) => (
            <IssueRow key={i} issue={issue} onNavigate={setActivePosition} />
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-3">
          <div className="text-uppercase fw-bold mb-1" style={{ fontSize: 10, color: '#997404', letterSpacing: 0.5 }}>
            Warnings ({warnings.length})
          </div>
          {warnings.map((issue, i) => (
            <IssueRow key={i} issue={issue} onNavigate={setActivePosition} />
          ))}
        </div>
      )}

      {validationResults.length > 0 && errors.length === 0 && warnings.length === 0 && (
        <div className="text-success small">✓ No issues found.</div>
      )}
    </div>
  )
}

function IssueRow({ issue, onNavigate }) {
  const isError = issue.severity === 'error'
  const icon = isError ? '✕' : '⚠'
  const color = isError ? '#dc3545' : '#997404'

  return (
    <div
      className="mb-2 p-2 rounded"
      style={{
        background: isError ? '#fff5f5' : '#fffbe6',
        border: `1px solid ${isError ? '#f5c2c7' : '#ffd677'}`,
        cursor: issue.ref ? 'pointer' : 'default',
        fontSize: 12,
      }}
      onClick={() => issue.ref && onNavigate(issue.ref)}
      title={issue.ref ? `Click to navigate to ${issue.ref}` : ''}
    >
      <div className="d-flex align-items-start gap-1">
        <span style={{ color, flexShrink: 0, fontWeight: 700 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 600, color }}>{issue.rule}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>{issue.message}</div>
          {issue.ref && (
            <div style={{ fontSize: 10, color: '#0d6efd', marginTop: 2 }}>→ {issue.ref}</div>
          )}
        </div>
      </div>
    </div>
  )
}
