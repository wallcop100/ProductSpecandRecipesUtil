import React from 'react'
import { Dropdown } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import { ACTION_ICONS } from '../utils/entityStyle'

const Check = ({ on }) => <MaterialIcon name={on ? 'check_box' : 'check_box_outline_blank'} size={14} />

/**
 * PositionListMenu — the PositionTypes list's settings, in one ⋯ menu shared by the overview
 * and the recipe-view sidebar: what to show, how to sort, and the two review wizards.
 */
export default function PositionListMenu({ families = [], emptyCount = 0, driftCount = 0, hasForm = false, incompleteCount = 0,
  onReviewEmpty, onReviewDrift, showTagsOption = false }) {
  const view = useStore(s => s.positionList)
  const set = useStore(s => s.setPositionList)
  const flip = key => set(v => ({ [key]: !v[key] }))
  return (
    <Dropdown align="end">
      <Dropdown.Toggle as={IconButton} bsSize="sm" variant="outline-secondary" icon={ACTION_ICONS.more}
        title="List options" aria-label="List options" />
      <Dropdown.Menu style={{ fontSize: 12 }}>
        <Dropdown.Header>Show</Dropdown.Header>
        {hasForm && (
          <Dropdown.Item onClick={() => flip('formOnly')}><Check on={view.formOnly} /> Only Form incomplete{incompleteCount ? ` (${incompleteCount})` : ''}</Dropdown.Item>
        )}
        <Dropdown.Item onClick={() => flip('emptyOnly')}><Check on={view.emptyOnly} /> Only with no recipe</Dropdown.Item>
        <Dropdown.Item onClick={() => flip('showIgnored')}><Check on={view.showIgnored} /> Ignored positions</Dropdown.Item>
        {showTagsOption && <Dropdown.Item onClick={() => flip('showTags')}><Check on={view.showTags} /> Tags on each row</Dropdown.Item>}
        <Dropdown.Divider />
        <Dropdown.Header>Sort</Dropdown.Header>
        <Dropdown.Item onClick={() => set({ sort: 'ref' })}><Check on={view.sort === 'ref'} /> By ref</Dropdown.Item>
        <Dropdown.Item onClick={() => set({ sort: 'status' })}><Check on={view.sort === 'status'} /> By status (to do first)</Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item onClick={() => set({ collapsed: families })}><MaterialIcon name="unfold_less" size={14} /> Collapse all families</Dropdown.Item>
        <Dropdown.Item onClick={() => set({ collapsed: [] })}><MaterialIcon name="unfold_more" size={14} /> Expand all families</Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item onClick={onReviewEmpty} disabled={emptyCount === 0}>
          <MaterialIcon name="checklist" size={14} /> Review empty{emptyCount ? ` (${emptyCount})` : ''}
        </Dropdown.Item>
        <Dropdown.Item onClick={onReviewDrift} disabled={driftCount === 0}>
          <MaterialIcon name="warning" size={14} /> Tag changes{driftCount ? ` (${driftCount})` : ''}
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}
