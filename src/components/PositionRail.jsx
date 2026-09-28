import React, { useEffect, useRef, useState } from 'react'
import { Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import PositionListMenu from './PositionListMenu'
import usePositionList from './usePositionList'
import { positionFamilyOf } from '../utils/positionFamily'
import { ACTION_ICONS } from '../utils/entityStyle'

export const STATUS_DOT = {
  empty: { color: '#dc3545', label: 'No recipe yet' },
  form: { color: '#fd7e14', label: 'The Form asks for something it lacks' },
  done: { color: '#198754', label: 'Has a recipe' },
  ignored: { color: '#ced4da', label: 'Ignored' },
}

const LS_KEY = 'positionRail'
const readLS = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {} } catch { return {} } }
const writeLS = v => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)) } catch { /* private window */ } }

/**
 * PositionRail — the PositionTypes list, collapsed to a left sidebar while one position's
 * recipe is open: the selected one is highlighted, the others are one click (or ↑ / ↓) away.
 * Rows are ref + status dot; the name is on hover. Settings live in the ⋯ menu.
 */
export default function PositionRail({ onReviewEmpty, onReviewDrift }) {
  const activeRef = useStore(s => s.activePositionRef)
  const setActivePosition = useStore(s => s.setActivePosition)
  const setView = useStore(s => s.setPositionList)
  const tagDrift = useStore(s => s.tagDrift)
  const formCaptures = useStore(s => s.formCaptures)
  const positionTypes = useStore(s => s.positionTypes)
  const list = usePositionList()
  const { view, groups, ignoredGroups, statusOf, availableTags, order, incompleteRefs } = list

  const [prefs, setPrefs] = useState(() => ({ width: 200, collapsed: false, ...readLS() }))
  const [showTags, setShowTags] = useState(false)
  useEffect(() => writeLS(prefs), [prefs])

  // The current position's family is always open, so the highlight is never hidden.
  const activePt = positionTypes.find(pt => pt.PositionTypeRef === activeRef)
  const activeFam = activePt ? (positionFamilyOf(activePt) || '(no family)') : null
  const isCollapsed = fam => fam !== activeFam && view.collapsed.includes(fam)
  const toggleFam = fam => setView(v => ({ collapsed: v.collapsed.includes(fam) ? v.collapsed.filter(f => f !== fam) : [...v.collapsed, fam] }))

  const listRef = useRef(null)
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]')
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [activeRef, prefs.collapsed])

  const go = ref => {
    if (!ref || ref === activeRef) return
    useStore.getState().leavePosition(activeRef, () => setActivePosition(ref))
  }
  const onKeyDown = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    if (e.target.tagName === 'INPUT') return
    e.preventDefault()
    const i = order.indexOf(activeRef)
    go(order[e.key === 'ArrowDown' ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1)])
  }

  // Drag the right edge to resize.
  const startResize = e => {
    e.preventDefault()
    const x0 = e.clientX, w0 = prefs.width
    const move = ev => setPrefs(p => ({ ...p, width: Math.max(140, Math.min(420, w0 + ev.clientX - x0)) }))
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  if (prefs.collapsed) {
    return (
      <div data-testid="position-rail" className="border-end bg-white d-flex flex-column align-items-center py-2"
        style={{ width: 32, flexShrink: 0 }}>
        <IconButton icon="last_page" size={18} title="Show PositionTypes"
          onClick={() => setPrefs(p => ({ ...p, collapsed: false }))} />
        <div className="mt-2 text-muted" style={{ writingMode: 'vertical-rl', fontSize: 11, letterSpacing: 0.5 }}>{activeRef}</div>
      </div>
    )
  }

  const families = [...groups, ...ignoredGroups].map(([f]) => f)
  const renderGroup = ([fam, pts]) => {
    const collapsed = isCollapsed(fam)
    const built = pts.filter(pt => statusOf(pt) === 'done').length
    return (
      <div key={fam}>
        <div role="button" onClick={() => toggleFam(fam)} className="d-flex align-items-center gap-1 px-2 py-1 text-uppercase"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: '#6c757d', userSelect: 'none', cursor: 'pointer' }}>
          <MaterialIcon name={collapsed ? ACTION_ICONS.collapse : ACTION_ICONS.expand} size={14} />
          <span className="text-truncate" title={fam}>{fam}</span>
          <span className="ms-auto fw-normal" title={`${built} of ${pts.length} have a recipe with nothing outstanding`}>{built}/{pts.length}</span>
        </div>
        {!collapsed && pts.map(pt => {
          const ref = pt.PositionTypeRef
          const st = statusOf(pt)
          const on = ref === activeRef
          const name = pt.Name || pt.name || ''
          return (
            <div key={ref} role="button" data-active={on ? 'true' : undefined} data-testid={`rail-${ref}`}
              onClick={() => go(ref)} title={[name && name !== ref ? name : null, STATUS_DOT[st].label].filter(Boolean).join(' · ')}
              className="d-flex align-items-center gap-2 ps-4 pe-2"
              style={{
                fontSize: 12, lineHeight: '22px', cursor: 'pointer', fontFamily: 'monospace',
                background: on ? '#e7f1ff' : undefined, borderLeft: `3px solid ${on ? '#0d6efd' : 'transparent'}`,
                fontWeight: on ? 700 : 400, opacity: st === 'ignored' ? 0.6 : 1,
              }}>
              <span aria-label={STATUS_DOT[st].label} style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[st].color, flexShrink: 0 }} />
              <span className="text-truncate">{ref}</span>
              {tagDrift?.[ref] && <MaterialIcon name="warning" size={12} style={{ color: '#e0a800' }} title="Tags changed" />}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div data-testid="position-rail" className="border-end bg-white d-flex flex-column position-relative"
      style={{ width: prefs.width, flexShrink: 0, minHeight: 0 }} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="d-flex align-items-center gap-1 px-2 py-1 border-bottom" style={{ flexShrink: 0 }}>
        <Form.Control size="sm" placeholder="Filter…" value={view.text} aria-label="Filter positions"
          onChange={e => setView({ text: e.target.value })} style={{ fontSize: 12, minWidth: 0 }} />
        {availableTags.length > 0 && (
          <IconButton icon="filter_list" size={16} title="Filter by tag" iconStyle={{ color: view.tags.length ? '#0d6efd' : undefined }}
            onClick={() => setShowTags(v => !v)} />
        )}
        <PositionListMenu families={families}
          emptyCount={groups.flatMap(([, p]) => p).filter(pt => statusOf(pt) === 'empty').length}
          driftCount={Object.keys(tagDrift || {}).length}
          hasForm={!!formCaptures} incompleteCount={incompleteRefs.size}
          onReviewEmpty={onReviewEmpty} onReviewDrift={onReviewDrift} />
        <IconButton icon="first_page" size={16} title="Hide PositionTypes"
          onClick={() => setPrefs(p => ({ ...p, collapsed: true }))} />
      </div>
      {showTags && (
        <div className="d-flex flex-wrap gap-1 px-2 py-1 border-bottom" style={{ flexShrink: 0 }}>
          {availableTags.map(t => {
            const on = view.tags.includes(t)
            return (
              <span key={t} role="button" onClick={() => setView(v => ({ tags: on ? v.tags.filter(x => x !== t) : [...v.tags, t] }))}
                className={`badge ${on ? 'bg-primary' : 'bg-light text-dark border'}`} style={{ fontSize: 10, cursor: 'pointer' }}>{t}</span>
            )
          })}
        </div>
      )}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
        {groups.map(renderGroup)}
        {view.showIgnored && ignoredGroups.length > 0 && (
          <>
            <div className="px-2 pt-2 text-muted" style={{ fontSize: 10, fontWeight: 700 }}>IGNORED</div>
            {ignoredGroups.map(renderGroup)}
          </>
        )}
        {order.length === 0 && <div className="text-muted small text-center mt-3">Nothing matches.</div>}
      </div>
      <div onMouseDown={startResize} title="Drag to resize"
        style={{ position: 'absolute', top: 0, right: -3, width: 6, height: '100%', cursor: 'col-resize', zIndex: 3 }} />
    </div>
  )
}
