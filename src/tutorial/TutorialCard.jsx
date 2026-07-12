import React, { useState, useEffect } from 'react'
import { Modal, Button } from 'react-bootstrap'
import MaterialIcon from '../components/MaterialIcon'
import { TUTORIALS, ALL_TUTORIAL_IDS } from './tutorials'
import { SCENES } from './scenes'
import { markSeen, markAllSeen } from './seen'

/**
 * TutorialCard — the one shell every pane's tutorial plays in.
 *
 * A centred modal, because that is the idiom BOTH existing teachers use (ConceptCard's
 * modal, PrimingModal's step-through) and because eleven different panes cannot each absorb
 * an inline card without layout jank. The step mechanics are PrimingModal's, exactly:
 * Next/Back, clickable progress dots (done green, current blue, future grey), reset to the
 * first step on open.
 *
 * Closing it BY ANY MEANS marks the card seen — a tutorial that reopens itself after being
 * closed is a tutorial the user learns to hate. The ? chip brings it back forever.
 */
export default function TutorialCard({ id, show, onHide }) {
  const card = TUTORIALS[id]
  const [step, setStep] = useState(0)
  useEffect(() => { if (show) setStep(0) }, [show])

  if (!card) return null
  const steps = card.steps
  const current = steps[step]
  const last = step === steps.length - 1
  const Scene = SCENES[current.scene]

  function dismiss() {
    markSeen(id)
    onHide()
  }

  function skipAll() {
    markAllSeen(ALL_TUTORIAL_IDS)
    onHide()
  }

  return (
    <Modal show={show} onHide={dismiss} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name={card.icon || 'school'} size={18} />
          {card.title}
          <span className="text-muted fw-normal" style={{ fontSize: 11 }}>
            step {step + 1} of {steps.length}
          </span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {step === 0 && (
          <div className="text-muted mb-2" style={{ fontSize: 12, lineHeight: 1.5 }}>{card.intro}</div>
        )}
        <div className="mb-2" style={{ fontSize: 13, lineHeight: 1.5, minHeight: 40 }}>
          {current.blurb}
        </div>
        {Scene && <Scene beat={current.beat} />}
      </Modal.Body>

      <Modal.Footer className="d-flex align-items-center">
        <Button variant="link" size="sm" className="p-0 text-muted me-auto" style={{ fontSize: 10 }}
          onClick={skipAll} title="Never auto-open any tutorial again — the ? chips still work">
          Skip all tutorials
        </Button>

        {/* PrimingModal's dots: done green, current blue, future grey, clickable. */}
        <div className="d-flex align-items-center gap-1 mx-2">
          {steps.map((_, i) => (
            <div key={i} role="button" aria-label={`Step ${i + 1}`}
              onClick={() => setStep(i)}
              style={{
                width: 18, height: 5, borderRadius: 3, cursor: 'pointer',
                background: i < step ? '#198754' : i === step ? '#0d6efd' : '#e9ecef',
                transition: 'background .2s ease',
              }} />
          ))}
        </div>

        <Button variant="outline-secondary" size="sm" disabled={step === 0}
          onClick={() => setStep(s => s - 1)}>
          Back
        </Button>
        {last ? (
          <Button variant="primary" size="sm" onClick={dismiss}>Got it</Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => setStep(s => s + 1)}>Next →</Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
