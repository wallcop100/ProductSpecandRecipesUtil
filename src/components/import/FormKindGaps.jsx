import React, { useState } from 'react'
import { Button } from 'react-bootstrap'
import MaterialIcon from '../MaterialIcon'
import { jobLabel } from '../../utils/recipeKinds'

/**
 * FormKindGaps — at the Form step, the positions whose codes leave out a part positions like them
 * usually have ("C01r, C03r: usually also end caps (96%), diffuser — not on the Form").
 * Information only; dismissing a line is an outcome (it feeds what is shown next time).
 */
export default function FormKindGaps({ gaps = [], onAnswer = () => {} }) {
  const [gone, setGone] = useState(() => new Set())
  const shown = gaps.filter(g => !gone.has(g.key))
  if (!shown.length) return null
  return (
    <div className="mb-2 px-2 py-1 rounded" data-testid="form-kind-gaps" style={{ background: '#eef5ff', border: '1px solid #c9dcf5', fontSize: 12 }}>
      {shown.map(g => (
        <div key={g.key} className="d-flex align-items-center gap-2 py-1">
          <MaterialIcon name="lightbulb" size={13} style={{ color: '#1c5cab' }} />
          <span style={{ flex: 1 }}>
            <span className="font-monospace">{g.positions.slice(0, 6).join(', ')}{g.positions.length > 6 ? ` +${g.positions.length - 6}` : ''}</span>
            : positions like {g.positions.length === 1 ? 'this' : 'these'} usually also have{' '}
            {g.missing.map((s, i) => <span key={s.slot}>{i ? ', ' : ''}<b>{jobLabel(s.slot)}</b> ({Math.round(s.share * 100)}%)</span>)}
            <span className="text-muted"> — not on the Form</span>
          </span>
          <Button size="sm" variant="link" className="text-muted p-0" aria-label="Dismiss" title="Not for these"
            onClick={() => { setGone(s => new Set(s).add(g.key)); onAnswer(g, 'dismissed') }}>
            <MaterialIcon name="close" size={13} />
          </Button>
        </div>
      ))}
    </div>
  )
}
