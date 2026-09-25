import React from 'react'
import { Button } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import { hasNoteCollision } from '../utils/productCodes'
import UsagePopover from './UsagePopover'
import CopyButton from './CopyButton'
import { codeDiff } from '../utils/etRefSuggest'

/**
 * CompareCodesPanel — the distinct codes, and where each one is going.
 *
 * Duplicates and near-misses no longer live here: they are adjudicated in
 * NeedsResolving, above, where the codes can be seen side by side. What remains is
 * a flat list — one line per distinct code — whose only outstanding question is
 * "which ElementType?".
 *
 * Props:
 *   entries       — resolved distinct entries: { text, variants, positionTypes,
 *                   manufacturers, rowRefs, status, etRef }
 *   knownPTs      — Set of PositionTypeRefs the project knows (others get a "?")
 *   ptTarget(pt)  — the PositionType a form ref resolves to (see ptResolve); shown
 *                   when it differs, so a redirect is never invisible
 *   onCreateET(entry)   — entry carries `suggestedRef` to prefill the new ET
 *   onReuse(entry, ref) — assign an existing ElementType instead of creating one
 *   onJump(entry)       — click the code to jump back to the row that produced it
 */

/**
 * How a candidate differs from this code: the two codes, one above the other, with
 * the characters that differ marked. A percentage ("variant · 63%") said something was
 * similar without saying what; the diff lets you decide at a glance whether the
 * difference is an attribute (a colour temp, a finish) or a different product.
 */
function CodeDiff({ code, other }) {
  const parts = codeDiff(code, other)
  const line = (keep, mark, bg) => parts
    .filter(p => p.op === 'same' || p.op === keep)
    .map((p, i) => p.op === 'same'
      ? <span key={i}>{p.text}</span>
      : <mark key={i} style={{ background: bg, color: mark, padding: '0 1px', fontWeight: 700, borderRadius: 2 }}>{p.text}</mark>)
  const label = { display: 'inline-block', width: 44, fontFamily: 'system-ui, sans-serif', fontSize: 9 }
  return (
    <div className="ms-3 mt-1 px-1 rounded" data-testid="code-diff"
      style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.45, background: '#f8f9fa' }}>
      <div><span className="text-muted" style={label}>this</span>{line('del', '#842029', '#f5c2c7')}</div>
      <div><span className="text-muted" style={label}>existing</span>{line('add', '#0f5132', '#a3cfbb')}</div>
    </div>
  )
}

const BG = { green: '#d1e7dd', amber: '#fff3cd', blue: '#cfe2ff', grey: '#f1f3f5' }
const FG = { green: '#0f5132', amber: '#856404', blue: '#084298', grey: '#495057' }

function PositionTypes({ pts, knownPTs, ptTarget }) {
  if (!pts.length) return null
  return (
    <div className="text-muted" style={{ fontSize: 10 }}>
      used by{' '}
      {pts.map((pt, i) => {
        const target = ptTarget?.(pt)
        const known = target || !knownPTs || knownPTs.has(pt)
        const redirected = target && target !== pt
        return (
          <span key={pt}
            title={!known ? 'Not a PositionType in this project — the Form names it but nothing here does'
              : redirected ? `Recipe goes to ${target} (the DesignDB's ExtRef says so)` : ''}
            style={{ fontFamily: 'monospace', color: known ? '#6c757d' : '#b45309' }}>
            {pt}{known ? '' : '?'}
            {redirected && <span style={{ color: '#084298' }}>→{target}</span>}
            {i < pts.length - 1 ? ', ' : ''}
          </span>
        )
      })}
    </div>
  )
}

export default function CompareCodesPanel({ entries, knownPTs, ptTarget, onCreateET, onReuse, onJump }) {
  if (!entries.length) {
    return <div className="text-muted fst-italic" style={{ fontSize: 11 }}>Confirm a row to collect its codes.</div>
  }

  return (
    <div>
      {entries.map(e => {
        const blocked = hasNoteCollision(e)
        return (
          <div key={e.text} className="py-1 border-bottom" style={{ fontSize: 11, opacity: blocked ? 0.5 : 1 }}>
            <div className="d-flex align-items-center gap-1">
              <span onClick={() => onJump?.(e)}
                title="Jump back to the row this came from, to adjust it"
                className="pc-jump"
                style={{ fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={ev => { ev.currentTarget.style.textDecoration = 'underline' }}
                onMouseLeave={ev => { ev.currentTarget.style.textDecoration = 'none' }}>
                {e.text}
              </span>
              <CopyButton text={e.text} what={`code ${e.text}`} size={11} />
              <span className="rounded px-1" style={{ background: BG[e.status], color: FG[e.status], fontSize: 10 }}>
                {e.status}
              </span>
              <span className="text-muted ms-auto">{e.rowRefs.length} row{e.rowRefs.length === 1 ? '' : 's'}</span>
            </div>

            {/* A product is (maker, code). The two are never shown apart. */}
            <div style={{ fontSize: 10 }} className={e.manufacturers.length > 1 ? 'text-warning' : 'text-muted'}>
              {e.manufacturers.length > 1 && <MaterialIcon name="warning" size={10} />}{' '}
              {e.manufacturers.length ? e.manufacturers.join(' / ') : <span className="fst-italic">no manufacturer</span>}
              {e.manufacturers.length > 1 && ' — one code, two makers'}
            </div>

            {/* The spec already has this code, but under a different maker: a different product. */}
            {e.otherMaker && (
              <div style={{ fontSize: 10, color: '#b45309' }}>
                <MaterialIcon name="call_split" size={10} /> {e.otherMaker.manufacturer || 'another maker'} uses this
                code for <span style={{ fontFamily: 'monospace' }}>{e.otherMaker.ref}</span> — not the same product.
              </div>
            )}

            <PositionTypes pts={e.positionTypes} knownPTs={knownPTs} ptTarget={ptTarget} />

            {/* Reuse: existing ETs this code might already be. One click assigns
                the existing ref — the dedup win, no new ET minted. */}
            {!e.etRef && !blocked && (e.reuse?.length > 0) && (
              <div className="mt-1">
                {e.reuse.map(c => (
                  <div key={c.ref} className="py-1" style={{ fontSize: 10 }}>
                  <div className="d-flex align-items-center gap-1">
                    <MaterialIcon name={c.kind === 'same' ? 'link' : 'call_split'} size={12}
                      style={{ color: c.kind === 'same' ? '#198754' : '#b45309' }} />
                    <span style={{ fontFamily: 'monospace' }}>{c.ref}</span>
                    <span className="text-muted">
                      {c.kind === 'same'
                        ? (c.matchedCode ? 'same code' : 'code appears in its name')
                        : c.matchedCode ? 'similar code' : 'similar name'}
                    </span>
                    <Button size="sm" variant="outline-success" className="ms-auto"
                      style={{ fontSize: 9, padding: '0 5px' }}
                      title={`Reuse ${c.ref}${c.matchedCode ? ` (${c.matchedCode})` : ''} instead of creating a new ElementType`}
                      onClick={() => onReuse(e, c.ref)}>
                      Use
                    </Button>
                  </div>
                  {c.kind !== 'same' && (c.matchedCode
                    ? <CodeDiff code={e.text} other={c.matchedCode} />
                    : c.description && <div className="text-muted text-truncate" title={c.description}>{c.description}</div>)}
                  </div>
                ))}
              </div>
            )}

            <div className="d-flex align-items-center gap-1 mt-1">
              {e.etRef
                ? <span className="text-success" style={{ fontFamily: 'monospace' }}>
                    <MaterialIcon name="check" size={11} />{' '}
                    <UsagePopover etRef={e.etRef} placement="left">{e.etRef}</UsagePopover>
                  </span>
                : blocked
                  ? <span className="text-muted fst-italic" style={{ fontSize: 10 }}>resolve above first</span>
                  : <Button size="sm" variant="outline-primary" style={{ fontSize: 10, padding: '0 6px' }}
                      onClick={() => onCreateET(e)}
                      title={e.suggestedRef ? `Create ${e.suggestedRef}` : 'Create a new ElementType'}>
                      Create {e.suggestedRef || 'ET'}
                    </Button>}
              {!blocked && e.variants[0]?.note && (
                <span className="text-muted text-truncate" style={{ fontSize: 10, maxWidth: 150 }}
                  title={e.variants[0].note}>
                  note: {e.variants[0].note}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
