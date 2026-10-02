import React from 'react'
import { Form } from 'react-bootstrap'
import { TAG_OPS } from '../utils/tagRules'
import MaterialIcon from './MaterialIcon'

/**
 * RuleBuilder — a rule's conditions joined by AND / OR, the tag-rule editor's pattern.
 * Used by tag rules and by connector templates.
 *
 * rule: { match: 'all' | 'any', conditions: [{ column, op, value }] }
 * columns: [{ label, options: [{ key, label }] }] — the fields, grouped
 * valueOptions: { [column]: [value] } — suggestions for a field's value (e.g. tag names)
 */
const OP = new Map(TAG_OPS.map(o => [o.op, o]))

function ConditionRow({ cond, columns, valueOptions, onChange, onRemove, canRemove, index }) {
  const meta = OP.get(cond.op) || TAG_OPS[0]
  const setBound = (i, v) => {
    const parts = String(cond.value ?? '').split(',')
    parts[i] = v
    onChange({ value: parts.join(',') })
  }
  const [lo, hi] = String(cond.value ?? '').split(',')
  const listId = valueOptions?.[cond.column]?.length ? `rule-values-${cond.column}-${index}` : undefined

  return (
    <div className="tag-cond d-flex align-items-center gap-2 px-2 py-1 rounded"
      style={{ background: '#f8f9fb', border: '1px solid #edeff2' }}>
      <Form.Select size="sm" value={cond.column} style={{ flex: '1 1 150px', minWidth: 130, fontSize: 12 }}
        onChange={e => onChange({ column: e.target.value })} aria-label="Column">
        {columns.map(g => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </optgroup>
        ))}
      </Form.Select>
      <Form.Select size="sm" value={cond.op} style={{ flex: '0 0 140px', fontSize: 12 }} aria-label="Operator"
        onChange={e => onChange({ op: e.target.value })}>
        {TAG_OPS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
      </Form.Select>

      {meta.twoValues ? (
        <div className="d-flex align-items-center gap-1" style={{ flex: '1 1 auto' }}>
          <Form.Control size="sm" type="number" value={lo ?? ''} placeholder="min" style={{ width: 76, fontSize: 12 }}
            onChange={e => setBound(0, e.target.value)} />
          <span className="text-muted" style={{ fontSize: 11 }}>and</span>
          <Form.Control size="sm" type="number" value={hi ?? ''} placeholder="max" style={{ width: 76, fontSize: 12 }}
            onChange={e => setBound(1, e.target.value)} />
        </div>
      ) : meta.needsValue ? (
        <>
          <Form.Control size="sm" type={meta.numeric ? 'number' : 'text'} value={cond.value ?? ''} list={listId}
            placeholder="value" aria-label="Value" style={{ flex: '1 1 120px', minWidth: 90, fontSize: 12 }}
            onChange={e => onChange({ value: e.target.value })} />
          {listId && <datalist id={listId}>{valueOptions[cond.column].map(v => <option key={v} value={v} />)}</datalist>}
        </>
      ) : (
        <span className="text-muted fst-italic" style={{ flex: '1 1 auto', fontSize: 11 }}>(no value)</span>
      )}

      <button type="button" className="btn btn-sm text-danger p-0 border-0" title="Remove condition" aria-label="Remove condition"
        style={{ opacity: canRemove ? 0.6 : 0.2, lineHeight: 1 }}
        disabled={!canRemove} onClick={onRemove}>
        <MaterialIcon name="close" size={15} />
      </button>
    </div>
  )
}

/**
 * The AND / OR between two conditions. The first one is interactive and flips the whole
 * rule's mode (a rule is all-or-any, not per-pair); the rest mirror it, so the column
 * reads as one boolean expression — the Notion-filter pattern.
 */
function Connector({ match, interactive, onToggle }) {
  const any = match === 'any'
  const word = any ? 'OR' : 'AND'
  const fg = any ? '#b45309' : '#0d6efd'
  const bg = any ? '#fff4e5' : '#e7f1ff'
  return (
    <div className="d-flex align-items-center" style={{ paddingLeft: 6, height: 22 }}>
      <div style={{ width: 2, background: '#e5e7eb', alignSelf: 'stretch', marginRight: 8 }} />
      {interactive ? (
        <button type="button" onClick={onToggle}
          title={any ? 'OR — any condition matches. Click for AND.' : 'AND — every condition matches. Click for OR.'}
          className="rounded-pill border-0 px-2"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: fg, background: bg, lineHeight: '18px', cursor: 'pointer' }}>
          {word}
        </button>
      ) : (
        <span className="rounded-pill px-2" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: fg, background: bg, lineHeight: '18px' }}>
          {word}
        </span>
      )}
    </div>
  )
}

export default function RuleBuilder({ rule, columns, valueOptions = {}, onChange, newCondition, minConditions = 1 }) {
  const conds = rule?.conditions || []
  const patchCond = (i, patch) => onChange({ conditions: conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const addCond = () => onChange({ conditions: [...conds, { ...newCondition }] })
  const removeCond = i => onChange({ conditions: conds.filter((_, j) => j !== i) })
  const toggleMatch = () => onChange({ match: rule?.match === 'any' ? 'all' : 'any' })
  return (
    <>
      {conds.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Connector match={rule.match} interactive={i === 1} onToggle={toggleMatch} />}
          <ConditionRow cond={c} index={i} columns={columns} valueOptions={valueOptions} canRemove={conds.length > minConditions}
            onChange={patch => patchCond(i, patch)} onRemove={() => removeCond(i)} />
        </React.Fragment>
      ))}
      <button type="button" onClick={addCond}
        className="btn btn-sm w-100 mt-2 d-inline-flex align-items-center justify-content-center gap-1"
        style={{ fontSize: 11, color: '#6c757d', border: '1px dashed #cbd5e1', borderRadius: 8, background: 'transparent' }}>
        <MaterialIcon name="add" size={13} /> Add condition
      </button>
    </>
  )
}

/**
 * RulePills — a rule read-only, as the editor shows it: each condition a pill, joined by
 * the same coloured AND / OR pills. For saying what a rule is without opening the editor.
 */
export function RulePills({ rule, ...rest }) {
  const conds = (rule?.conditions || []).filter(c => c && c.column && c.op)
  if (!conds.length) return null
  const any = rule.match === 'any'
  const join = { color: any ? '#b45309' : '#0d6efd', background: any ? '#fff4e5' : '#e7f1ff' }
  const col = c => String(c.column).replace(/^Recipe\./, '')
  return (
    <span className="d-inline-flex flex-wrap align-items-center gap-1" data-testid="rule-pills" {...rest}>
      {conds.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span className="rounded-pill px-2" data-testid="rule-join"
              style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, lineHeight: '16px', ...join }}>{any ? 'OR' : 'AND'}</span>
          )}
          <span className="rounded-pill px-2" style={{ fontSize: 10, lineHeight: '18px', background: '#f1f3f5', border: '1px solid #dee2e6' }}>
            <span className="text-muted">{col(c)}</span> {OP.get(c.op)?.label || c.op}{OP.get(c.op)?.needsValue === false ? '' : <> <strong>{String(c.value ?? '')}</strong></>}
          </span>
        </React.Fragment>
      ))}
    </span>
  )
}
