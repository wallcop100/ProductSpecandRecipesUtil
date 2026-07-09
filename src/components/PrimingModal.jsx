import React, { useState, useEffect } from 'react'
import { Modal, Button } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import CodeChips from './CodeChips'
import PaintPalette from './PaintPalette'
import CaptureLines from './CaptureLines'
import { deriveCaptures } from '../utils/productCodes'

/**
 * PrimingModal — teach the tool this project's dialect before reviewing.
 *
 * Shows a handful of examples chosen to cover the most of the sheet's dialect
 * (see codeLearning.pickExamples): a lone code, a `+` ingredient list, a comma
 * list, a bracketed alt-code. You paint them with the same mechanism as the main
 * review; every paint teaches batch-wide, so by the time you reach the queue most
 * rows already carry suggestions.
 *
 * Entirely skippable — the review works fine without it.
 *
 * Props:
 *   show, onSkip, onDone(paintedRowIds)
 *   examples          — resolved rows to teach from
 *   rules, signals, captureOpts, suggestedFor(row)
 *   onPaint(rowId, idxs, role)
 *   onAcceptSuggestions(rowId)
 *   onEditNote(rowId, code, text)
 *   onMoveNote(rowId, fromCode, toCode)
 *   onMoveNoteWord(rowId, fromCode, toCode, word)
 */
export default function PrimingModal({
  show, onSkip, onDone, examples,
  signals, captureOpts, suggestedFor,
  onPaint, onAcceptSuggestions, onEditNote, onMoveNote, onMoveNoteWord,
}) {
  const [step, setStep] = useState(0)
  const [brush, setBrush] = useState('code')

  useEffect(() => { if (show) { setStep(0); setBrush('code') } }, [show])

  const row = examples[step]
  const last = step === examples.length - 1
  if (!show || !row) return null

  const readout = deriveCaptures(row, captureOpts)
  const suggested = suggestedFor(row)
  const codesSoFar = signals.shapes.size

  return (
    <Modal show={show} onHide={onSkip} size="xl" centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="school" size={18} />
          Teach the tool your dialect
          <span className="text-muted fw-normal ms-2" style={{ fontSize: 12 }}>
            example {step + 1} of {examples.length}
          </span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p className="text-muted" style={{ fontSize: 12 }}>
          These few rows between them show most of how this sheet is written. Paint the codes here
          and every identical word follows across the whole batch — the rest of the review then comes
          mostly pre-suggested. Nothing you skip is lost.
        </p>

        {/* progress dots */}
        <div className="d-flex gap-1 mb-3">
          {examples.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{
              flex: 1, height: 4, borderRadius: 2, cursor: 'pointer',
              background: i < step ? '#198754' : i === step ? '#0d6efd' : '#e9ecef',
            }} />
          ))}
        </div>

        <div className="text-muted mb-1" style={{ fontSize: 11 }}>
          {row.positionType && <strong>{row.positionType}</strong>}
          {row.manufacturer && <> · {row.manufacturer}</>}
        </div>

        <PaintPalette
          brush={brush} onBrush={setBrush}
          scope="batch" onScope={() => {}} showScope={false} showBoundaryToggle={false}
          suggestedCount={suggested.length}
          onAcceptSuggestions={() => onAcceptSuggestions(row.id)}
        />

        <div className="border rounded" style={{ background: '#fff' }}>
          <div className="p-3" style={{ minHeight: 100, display: 'flex', alignItems: 'center' }}>
            <CodeChips
              row={row}
              brush={brush}
              onSweep={idxs => onPaint(row.id, idxs, brush)}
              suggested={suggested}
            />
          </div>
          <div className="px-3 pb-2 pt-1" style={{ background: '#fcfcfd', borderTop: '1px solid #e9ecef' }}>
            <CaptureLines
              captures={readout.captures}
              discarded={readout.discarded}
              onEditNote={(code, text) => onEditNote(row.id, code, text)}
              onMoveNote={(from, to) => onMoveNote(row.id, from, to)}
              onMoveNoteWord={(from, to, word) => onMoveNoteWord(row.id, from, to, word)}
            />
          </div>
        </div>

        <div className="mt-2 d-flex align-items-center gap-2" style={{ fontSize: 11 }}>
          <span className="text-muted">learned so far:</span>
          <span className="rounded px-2" style={{ background: '#d1e7dd', color: '#0f5132' }}>
            {codesSoFar} code {codesSoFar === 1 ? 'pattern' : 'patterns'}
          </span>
          {signals.delimiters.size > 0 && (
            <span className="rounded px-2" style={{ background: '#e7f1ff', color: '#084298' }}>
              separators {[...signals.delimiters].join(' ')}
            </span>
          )}
          {signals.profile.minLen > 0 && (
            <span className="text-muted">
              codes {signals.profile.requireDigit ? 'contain digits, ' : ''}≥{signals.profile.minLen} chars
            </span>
          )}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="link" size="sm" style={{ fontSize: 12 }} onClick={onSkip}>
          Skip — I'll just review
        </Button>
        <div className="ms-auto d-flex gap-2">
          <Button variant="outline-secondary" size="sm" disabled={step === 0}
            onClick={() => setStep(s => s - 1)}>Back</Button>
          {last
            ? <Button variant="success" size="sm" onClick={() => onDone(examples.map(e => e.id))}>
                Done — start reviewing
              </Button>
            : <Button variant="primary" size="sm" onClick={() => setStep(s => s + 1)}>Next example →</Button>}
        </div>
      </Modal.Footer>
    </Modal>
  )
}
