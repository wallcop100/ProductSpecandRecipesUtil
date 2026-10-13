import React, { useEffect, useState } from 'react'
import { Button } from 'react-bootstrap'
import MaterialIcon from '../MaterialIcon'

/**
 * ColleagueSuggestions — what other people on this project (or several projects) settled that
 * this import has not: words in the code column that are notes, not codes; near-miss codes
 * that are different products. One line each, applied only on a click, and a refusal is
 * reported so it stops being suggested (see screens/import/useProjectKnowledge.js).
 *
 * Props:
 *   rules     [{ token, role, item }]    codeLearning rules this batch lacks
 *   separate  [group]                    near-miss groups a colleague kept separate
 */
const ROLE_LABEL = { code: 'codes', note: 'notes', discard: 'noise to ignore' }

export default function ColleagueSuggestions({ rules = [], separate = [], onApplyRules, onRefuseRules,
  onApplySeparate, onShown }) {
  const [hidden, setHidden] = useState({ rules: false, separate: false })
  const key = rules.map(r => r.token).join('|')
  useEffect(() => { if (rules.length) onShown?.(rules) }, [key])   // eslint-disable-line react-hooks/exhaustive-deps

  const showRules = rules.length > 0 && !hidden.rules
  const showSep = separate.length > 0 && !hidden.separate
  if (!showRules && !showSep) return null
  const byRole = rules.reduce((m, r) => ({ ...m, [r.role]: [...(m[r.role] || []), r.token] }), {})

  return (
    <div className="mb-2 p-2 rounded" style={{ fontSize: 11, background: '#f1f7ff' }} data-testid="colleague-suggestions">
      {showRules && (
        <div className="d-flex align-items-start gap-2">
          <MaterialIcon name="group" size={13} />
          <span className="flex-grow-1">
            Colleagues read {Object.entries(byRole).map(([role, toks], i) => (
              <span key={role}>{i > 0 && '; '}<b>{toks.slice(0, 6).join(', ')}</b>{toks.length > 6 && ` +${toks.length - 6}`} as {ROLE_LABEL[role] || role}</span>
            ))}.
          </span>
          <Button size="sm" variant="outline-primary" style={{ fontSize: 10, padding: '0 6px' }}
            onClick={() => { onApplyRules?.(rules); setHidden(h => ({ ...h, rules: true })) }}>Do the same</Button>
          <Button size="sm" variant="link" className="text-muted p-0" style={{ fontSize: 10 }}
            onClick={() => { onRefuseRules?.(rules); setHidden(h => ({ ...h, rules: true })) }}>No</Button>
        </div>
      )}
      {showSep && (
        <div className="d-flex align-items-start gap-2 mt-1">
          <MaterialIcon name="call_split" size={13} />
          <span className="flex-grow-1">
            A colleague kept {separate.length} near-miss group{separate.length === 1 ? '' : 's'} apart as different products
            {' '}(<span style={{ fontFamily: 'monospace' }}>{separate[0].map(e => e.text).join(' / ')}</span>{separate.length > 1 ? ', …' : ''}).
          </span>
          <Button size="sm" variant="outline-primary" style={{ fontSize: 10, padding: '0 6px' }}
            onClick={() => { onApplySeparate?.(separate); setHidden(h => ({ ...h, separate: true })) }}>Keep them apart</Button>
          <Button size="sm" variant="link" className="text-muted p-0" style={{ fontSize: 10 }}
            onClick={() => setHidden(h => ({ ...h, separate: true }))}>Not now</Button>
        </div>
      )}
    </div>
  )
}
