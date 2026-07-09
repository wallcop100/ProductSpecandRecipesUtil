import React from 'react'
import { Button } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import { norm } from '../utils/productCodes'

/**
 * NeedsResolving — everything blocking the batch, pinned above the code list.
 *
 * Two things are genuinely hard here, and both need the codes side by side:
 *
 *   Duplicates — the SAME code captured with DIFFERENT notes. Either the note makes
 *     it a different product (promote the note into the code, so it earns its own
 *     ref) or it does not (unify the note, one product).
 *
 *   Mismatches — codes standing in a prefix relation (250-1CH / 250-1CH-A). Either
 *     they are one product (consolidate onto a single ElementType) or they are not
 *     (keep separate, and the group stops asking).
 *
 * Nothing here decides for you. "Keep separate" is always one click, because the
 * answer really is "it depends" — that is the whole reason this step exists.
 */

const box = { background: '#fff8e1', border: '1px solid #f0e0a8' }

function Codes({ entries }) {
  return (
    <>
      {entries.map((e, i) => (
        <span key={e.text}>
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{e.text}</span>
          {e.etRef && <span className="text-success"> ({e.etRef})</span>}
          {i < entries.length - 1 && <span className="text-muted"> ↔ </span>}
        </span>
      ))}
    </>
  )
}

/** A code captured with two or more different notes. */
function Collision({ entry, onPromote, onUnify, onJump }) {
  return (
    <div className="py-2 border-bottom">
      <div className="d-flex align-items-center gap-1" style={{ fontSize: 11 }}>
        <MaterialIcon name="content_copy" size={12} style={{ color: '#856404' }} />
        <span onClick={() => onJump?.(entry)} className="pc-jump"
          title="Jump back to the row this came from"
          style={{ fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer' }}>
          {entry.text}
        </span>
        <span className="text-muted">same code, {entry.variants.length} notes</span>
      </div>

      {entry.variants.map((v, vi) => (
        <div key={vi} className="d-flex align-items-center gap-1 py-1 ps-3" style={{ fontSize: 10 }}>
          <span style={{ color: '#adb5bd' }}>{vi === entry.variants.length - 1 ? '└' : '├'}</span>
          <span style={{ fontStyle: v.note ? 'normal' : 'italic' }}>{v.note || '(no note)'}</span>
          <span className="text-muted" style={{ fontFamily: 'monospace', fontSize: 9 }}>
            {v.positionTypes.join(', ')}
          </span>
          {v.note && (
            <Button size="sm" variant="outline-warning" className="ms-auto"
              style={{ fontSize: 9, padding: '0 5px' }}
              title="These are different products: fold this note into the code so it earns its own ref"
              onClick={() => onPromote(entry, v)}>
              Promote
            </Button>
          )}
        </div>
      ))}

      <div className="ps-3 pt-1">
        <Button size="sm" variant="outline-secondary" style={{ fontSize: 9, padding: '0 5px' }}
          title="One product: keep the first note and drop the distinction"
          onClick={() => onUnify(entry, entry.variants[0].note)}>
          Same product — use “{entry.variants[0].note || 'no note'}”
        </Button>
      </div>
    </div>
  )
}

/** Codes that look like near-misses of one another. */
function Similar({ group, onMerge, onKeepSeparate, onJump }) {
  const assigned = group.filter(e => e.etRef)
  const targets = [...new Set(assigned.map(e => e.etRef))]

  return (
    <div className="py-2 border-bottom">
      <div className="d-flex align-items-center gap-1 mb-1" style={{ fontSize: 11 }}>
        <MaterialIcon name="call_split" size={12} style={{ color: '#856404' }} />
        <Codes entries={group} />
      </div>
      <div className="text-muted ps-3" style={{ fontSize: 10 }}>
        {group.map(e => (
          <div key={e.text} onClick={() => onJump?.(e)} className="pc-jump" style={{ cursor: 'pointer' }}>
            <span style={{ fontFamily: 'monospace' }}>{e.text}</span>
            {e.variants[0]?.note && <span> — {e.variants[0].note}</span>}
            <span className="text-muted"> · {e.positionTypes.join(', ') || 'no position'}</span>
          </div>
        ))}
      </div>
      <div className="d-flex gap-1 ps-3 pt-1">
        {targets.length <= 1 && (
          <Button size="sm" variant="outline-primary" style={{ fontSize: 9, padding: '0 5px' }}
            title={targets[0]
              ? `One product: put every code on ${targets[0]}`
              : 'One product: create a single ElementType for all of these'}
            onClick={() => onMerge(group, targets[0] || null)}>
            <MaterialIcon name="merge" size={10} /> Merge {group.length} into one{targets[0] ? ` (${targets[0]})` : ''}
          </Button>
        )}
        {targets.length > 1 && (
          <span className="text-muted" style={{ fontSize: 9 }}>
            already on {targets.join(' / ')} — unassign one to merge
          </span>
        )}
        <Button size="sm" variant="outline-secondary" style={{ fontSize: 9, padding: '0 5px' }}
          title="Genuinely different products — stop flagging these"
          onClick={() => onKeepSeparate(group)}>
          Keep separate
        </Button>
      </div>
    </div>
  )
}

export default function NeedsResolving({ collisions, similar, resolvedCount, onPromote, onUnify, onMerge, onKeepSeparate, onJump }) {
  const total = collisions.length + similar.length
  if (total === 0) {
    return resolvedCount > 0 ? (
      <div className="px-2 py-1 mb-2 rounded d-flex align-items-center gap-1"
        style={{ background: '#d1e7dd', color: '#0f5132', fontSize: 10 }}>
        <MaterialIcon name="check_circle" size={12} /> Nothing to resolve — {resolvedCount} code
        {resolvedCount === 1 ? '' : 's'} settled.
      </div>
    ) : null
  }

  return (
    <div className="mb-2 px-2 py-1 rounded" style={box}>
      <div className="fw-semibold d-flex align-items-center gap-1" style={{ color: '#92400e', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        <MaterialIcon name="warning" size={12} /> Needs resolving ({total})
      </div>
      {collisions.map(e => (
        <Collision key={norm(e.text)} entry={e} onPromote={onPromote} onUnify={onUnify} onJump={onJump} />
      ))}
      {similar.map(g => (
        <Similar key={g.map(e => norm(e.text)).join('|')} group={g}
          onMerge={onMerge} onKeepSeparate={onKeepSeparate} onJump={onJump} />
      ))}
    </div>
  )
}
