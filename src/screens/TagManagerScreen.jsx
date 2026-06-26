import React, { useState, useMemo, useEffect } from 'react'
import { Button, Nav, Form, Table, Badge, Alert } from 'react-bootstrap'
import { v4 as uuidv4 } from 'uuid'
import useStore from '../store/useStore'
import { TAG_COLUMNS, TAG_OPS, ruleMatches } from '../utils/tagRules'
import TagInput from '../components/TagInput'
import ProjectIdPill from '../components/ProjectIdPill'
import TagDriftWizard from '../components/TagDriftWizard'

/**
 * TagManagerScreen — the dedicated tag window.
 *  - Rules tab: edit the tag palette + the column→tag rules (live match counts).
 *  - Positions tab: per-position effective tags with add/remove exceptions.
 */
export default function TagManagerScreen({ onBack }) {
  const projectNumber = useStore(s => s.projectNumber)
  const configName    = useStore(s => s.configName)
  const positionTypes = useStore(s => s.positionTypes)
  const positionUI    = useStore(s => s.positionUI)
  const tagRules      = useStore(s => s.tagRules)
  const tagPalette    = useStore(s => s.tagPalette)
  const setTagRules   = useStore(s => s.setTagRules)
  const setTagPalette = useStore(s => s.setTagPalette)
  const togglePositionTag = useStore(s => s.togglePositionTag)
  const tagDrift = useStore(s => s.tagDrift)

  const [tab, setTab] = useState('rules')
  const [showDrift, setShowDrift] = useState(false)
  const driftCount = Object.keys(tagDrift || {}).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white" style={{ flexShrink: 0 }}>
        <Button variant="outline-secondary" size="sm" onClick={onBack}>← Back</Button>
        <span className="fw-semibold ms-1">Tags</span>
        {projectNumber && <ProjectIdPill number={projectNumber} configName={configName} size="sm" className="ms-1" />}
        <Nav variant="pills" activeKey={tab} onSelect={setTab} className="ms-3">
          <Nav.Item><Nav.Link eventKey="rules" className="py-1 px-3">Rules &amp; palette</Nav.Link></Nav.Item>
          <Nav.Item><Nav.Link eventKey="positions" className="py-1 px-3">Positions</Nav.Link></Nav.Item>
        </Nav>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {driftCount > 0 && (
          <Alert variant="warning" className="d-flex align-items-center py-2 px-3">
            <span className="small">
              <strong>{driftCount}</strong> position{driftCount === 1 ? '' : 's'} changed rule-derived tags since the last accepted baseline.
            </span>
            <Button size="sm" variant="warning" className="ms-auto" onClick={() => setShowDrift(true)}>
              Review changes
            </Button>
          </Alert>
        )}
        {tab === 'rules' ? (
          <RulesTab
            tagRules={tagRules} setTagRules={setTagRules}
            tagPalette={tagPalette} setTagPalette={setTagPalette}
            positionTypes={positionTypes}
          />
        ) : (
          <PositionsTab
            positionTypes={positionTypes} positionUI={positionUI}
            tagPalette={tagPalette} togglePositionTag={togglePositionTag}
          />
        )}
      </div>

      <TagDriftWizard show={showDrift} onHide={() => setShowDrift(false)} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rules & palette
// ---------------------------------------------------------------------------

function RulesTab({ tagRules, setTagRules, tagPalette, setTagPalette, positionTypes }) {
  // Local draft so editing doesn't persist/recompute on every keystroke.
  const [draft, setDraft] = useState(tagRules)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { setDraft(tagRules); setDirty(false) }, [tagRules])

  function update(id, patch) {
    setDraft(d => d.map(r => r.id === id ? { ...r, ...patch } : r))
    setDirty(true)
  }
  function addRule() {
    setDraft(d => [...d, { id: uuidv4(), column: 'PositionTypeRef', op: 'contains', value: '', tag: '', enabled: true }])
    setDirty(true)
  }
  function removeRule(id) {
    setDraft(d => d.filter(r => r.id !== id))
    setDirty(true)
  }
  function apply() { setTagRules(draft); setDirty(false) }

  const matchCount = (rule) => positionTypes.reduce((n, pt) => n + (ruleMatches(rule, pt) ? 1 : 0), 0)

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="mb-4">
        <div className="fw-semibold mb-2">Tag palette</div>
        <div className="text-muted small mb-2">Suggestions offered when adding tags. Tags are free-form — any string is allowed.</div>
        <TagInput value={tagPalette} onChange={setTagPalette} palette={[]} placeholder="Add a palette tag…" />
      </div>

      <div className="d-flex align-items-center mb-2">
        <div className="fw-semibold">Rules</div>
        <span className="text-muted small ms-2">Column value → tag</span>
        <div className="ms-auto d-flex gap-2">
          <Button size="sm" variant="outline-secondary" onClick={addRule}>+ Add rule</Button>
          <Button size="sm" variant={dirty ? 'primary' : 'outline-primary'} onClick={apply} disabled={!dirty}>
            {dirty ? 'Apply rules' : 'Applied'}
          </Button>
        </div>
      </div>

      <Table bordered hover size="sm" className="small align-middle">
        <thead className="table-light">
          <tr>
            <th style={{ width: 40 }}>On</th>
            <th style={{ minWidth: 180 }}>Column</th>
            <th style={{ width: 120 }}>Operator</th>
            <th style={{ minWidth: 140 }}>Value</th>
            <th style={{ minWidth: 160 }}>Tag</th>
            <th style={{ width: 90 }}>Matches</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {draft.length === 0 && (
            <tr><td colSpan={7} className="text-muted text-center py-3">No rules yet — add one to auto-tag positions.</td></tr>
          )}
          {draft.map(rule => (
            <tr key={rule.id} style={{ opacity: rule.enabled === false ? 0.5 : 1 }}>
              <td className="text-center">
                <Form.Check
                  type="checkbox"
                  checked={rule.enabled !== false}
                  onChange={e => update(rule.id, { enabled: e.target.checked })}
                />
              </td>
              <td>
                <Form.Select size="sm" value={rule.column} onChange={e => update(rule.id, { column: e.target.value })}>
                  {TAG_COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
                </Form.Select>
              </td>
              <td>
                <Form.Select size="sm" value={rule.op} onChange={e => update(rule.id, { op: e.target.value })}>
                  {TAG_OPS.map(o => <option key={o} value={o}>{o}</option>)}
                </Form.Select>
              </td>
              <td>
                <Form.Control size="sm" value={rule.value ?? ''} onChange={e => update(rule.id, { value: e.target.value })} />
              </td>
              <td>
                <Form.Control size="sm" list="tagmgr-palette" value={rule.tag ?? ''}
                  onChange={e => update(rule.id, { tag: e.target.value })} placeholder="tag" />
              </td>
              <td>
                <Badge bg={matchCount(rule) > 0 ? 'secondary' : 'light'} text={matchCount(rule) > 0 ? undefined : 'dark'}>
                  {matchCount(rule)}
                </Badge>
              </td>
              <td className="text-center">
                <Button variant="link" size="sm" className="text-danger p-0" onClick={() => removeRule(rule.id)}>✕</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <datalist id="tagmgr-palette">
        {tagPalette.map(p => <option key={p} value={p} />)}
      </datalist>

      {dirty && (
        <div className="text-muted small mt-1">Match counts use your edits; click <strong>Apply rules</strong> to re-tag all positions.</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Positions — per-position effective tags with add/remove exceptions
// ---------------------------------------------------------------------------

function PositionsTab({ positionTypes, positionUI, tagPalette, togglePositionTag }) {
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()

  const rows = useMemo(() => positionTypes.filter(pt => {
    if (!q) return true
    const ref = (pt.PositionTypeRef || '').toLowerCase()
    const ui = positionUI[pt.PositionTypeRef] || {}
    return ref.includes(q) || (ui.tags || []).some(t => t.toLowerCase().includes(q))
  }), [positionTypes, positionUI, q])

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="d-flex align-items-center mb-2">
        <span className="text-muted small">{rows.length} positions · rule tags show plain, manual additions marked, click × to override</span>
        <Form.Control size="sm" placeholder="Filter positions or tags…" value={filter}
          onChange={e => setFilter(e.target.value)} style={{ maxWidth: 260 }} className="ms-auto" />
      </div>

      <Table bordered size="sm" className="small align-middle">
        <thead className="table-light">
          <tr>
            <th style={{ minWidth: 220 }}>Position type</th>
            <th>Tags</th>
            <th style={{ width: 220 }}>Add tag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(pt => {
            const ref = pt.PositionTypeRef
            const ui = positionUI[ref] || {}
            const effective = ui.tags || []
            const ruleTags = ui.ruleTags || []
            const removed = (ui.tagRemove || []).filter(t => ruleTags.includes(t))
            return (
              <tr key={ref}>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{ref}</td>
                <td>
                  <div className="d-flex flex-wrap gap-1 align-items-center">
                    {effective.length === 0 && removed.length === 0 && (
                      <span className="text-muted fst-italic">no tags</span>
                    )}
                    {effective.map(tag => {
                      const isRule = ruleTags.includes(tag)
                      return (
                        <Badge key={tag} bg="secondary" style={{ fontWeight: 500, cursor: 'pointer' }}
                          title={isRule ? 'Rule tag — click to exclude on this position' : 'Manual tag — click to remove'}
                          onClick={() => togglePositionTag(ref, tag)}>
                          {tag}{!isRule && ' *'} ×
                        </Badge>
                      )
                    })}
                    {removed.map(tag => (
                      <Badge key={tag} bg="light" text="dark" style={{ border: '1px dashed #adb5bd', cursor: 'pointer', fontWeight: 400 }}
                        title="Excluded rule tag — click to restore"
                        onClick={() => togglePositionTag(ref, tag)}>
                        + {tag}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td>
                  <AddTagControl palette={tagPalette} existing={effective}
                    onAdd={tag => togglePositionTag(ref, tag)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>
      <div className="text-muted small">* = manual addition. Removing a rule-derived tag records an exception for that position only.</div>
    </div>
  )
}

function AddTagControl({ palette, existing, onAdd }) {
  const [text, setText] = useState('')
  const listId = 'addtag-palette'
  function commit() {
    const t = text.trim()
    if (t && !existing.includes(t)) onAdd(t)
    setText('')
  }
  return (
    <>
      <Form.Control size="sm" list={listId} value={text} placeholder="add tag…"
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} />
      <datalist id={listId}>
        {palette.filter(p => !existing.includes(p)).map(p => <option key={p} value={p} />)}
      </datalist>
    </>
  )
}
