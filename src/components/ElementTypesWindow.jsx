import React, { useEffect, useState } from 'react'
import { Nav } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import BulkCreateETModal from './BulkCreateETModal'
import ExistingETReviewModal from './ExistingETReviewModal'
import RetireUnusedModal from './RetireUnusedModal'

/**
 * ElementTypesWindow — one place for the project's ElementTypes: New (proposals from an
 * import), Existing (edit name / description / family), Unused (clean up). Each tab is the
 * window it used to be, shown without animation so switching does not flicker.
 *
 * `bulk` carries BulkCreateETModal's props when there are new ones to review; without it
 * the New tab is not offered.
 */
export default function ElementTypesWindow({ show, onHide, view: initial = 'existing', bulk = null }) {
  const count = useStore(s => s.elementTypes.length)
  const [view, setView] = useState(initial)
  useEffect(() => { if (show) setView(initial === 'new' && !bulk ? 'existing' : initial) }, [show, initial, bulk])

  const tabs = (
    <Nav variant="pills" className="ms-auto me-2" style={{ fontSize: 12 }} activeKey={view} onSelect={k => setView(k)}>
      {bulk && (
        <Nav.Item><Nav.Link eventKey="new" className="py-1 px-2">
          <MaterialIcon name="playlist_add" size={14} /> New ({bulk.proposals?.length || 0})
        </Nav.Link></Nav.Item>
      )}
      <Nav.Item><Nav.Link eventKey="existing" className="py-1 px-2">
        <MaterialIcon name="fact_check" size={14} /> Existing ({count})
      </Nav.Link></Nav.Item>
      <Nav.Item><Nav.Link eventKey="unused" className="py-1 px-2">
        <MaterialIcon name="cleaning_services" size={14} /> Unused
      </Nav.Link></Nav.Item>
    </Nav>
  )

  if (!show) return null
  if (view === 'new' && bulk) return <BulkCreateETModal {...bulk} show onHide={onHide} tabs={tabs} animation={false} />
  if (view === 'unused') return <RetireUnusedModal show onHide={onHide} tabs={tabs} animation={false} />
  return <ExistingETReviewModal show onHide={onHide} tabs={tabs} animation={false} />
}
