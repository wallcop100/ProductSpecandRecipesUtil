import React from 'react'
import { Modal, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

function fmt(v) {
  if (v === null || v === undefined || v === '') return <span className="text-muted fst-italic">blank</span>
  return <span style={{ fontFamily: 'monospace' }}>{String(v)}</span>
}

/**
 * ConflictModal — per-cell resolution of export staleness conflicts
 * (EXPORT_PLAN §3.4). The conflicted file has already been reloaded from disk
 * and the dirty registry kept; each row here is one cell where the file on
 * disk changed under a pending local edit.
 *
 * Keep mine  — the local value stays queued and will win on the next export.
 * Take theirs — the local edit for that cell is dropped; disk value stands.
 */
export default function ConflictModal() {
  const exportConflicts = useStore(s => s.exportConflicts)
  const resolveExportConflict = useStore(s => s.resolveExportConflict)

  if (!exportConflicts) return null
  const { target, items } = exportConflicts
  const fileLabel = target === 'ps' ? 'Product Spec' : 'Recipe Spec'

  return (
    <Modal show centered size="lg" backdrop="static" keyboard={false}>
      <Modal.Header>
        <Modal.Title style={{ fontSize: 14 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="warning" size={18} style={{ color: '#dc3545' }} />
          {fileLabel} changed on disk
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p className="text-muted small mb-3">
          The {fileLabel} file was edited outside the app while you had unexported
          changes. Nothing has been written — the file has been reloaded, and your
          edits are still queued. Decide each cell below, then press{' '}
          <strong>Export changes</strong> again.
        </p>

        <table className="table table-sm align-middle" style={{ fontSize: 12 }}>
          <thead className="table-light">
            <tr>
              <th>Row</th>
              <th>Field</th>
              <th>File says</th>
              <th>Your edit</th>
              <th style={{ width: 210 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={`${item.key}-${item.field}`}>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {target === 'ps' ? item.key : `row ${item.rowNum}`}
                </td>
                <td className="fw-semibold">{item.field}</td>
                <td>{fmt(item.diskValue)}</td>
                <td>{fmt(item.localValue)}</td>
                <td className="text-end">
                  <Button
                    variant="outline-success" size="sm" className="me-1"
                    style={{ fontSize: 11 }}
                    onClick={() => resolveExportConflict(i, 'mine')}
                    title="Your value stays queued and overwrites the file on next export"
                  >
                    Keep mine
                  </Button>
                  <Button
                    variant="outline-secondary" size="sm"
                    style={{ fontSize: 11 }}
                    onClick={() => resolveExportConflict(i, 'theirs')}
                    title="Drop your edit for this cell — the file's value stands"
                  >
                    Take theirs
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-muted" style={{ fontSize: 11 }}>
          {items.length} unresolved conflict{items.length !== 1 ? 's' : ''} — the modal
          closes when all are decided.
        </div>
      </Modal.Body>
    </Modal>
  )
}
