import React, { useState } from 'react'
import { Spinner, Button, ProgressBar, Modal } from 'react-bootstrap'
import DOMPurify from 'dompurify'
import MaterialIcon from './MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'

const barStyle = (bg, border) => ({
  position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1040,
  background: bg, borderTop: `1px solid ${border}`,
  padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12,
})

/**
 * UpdateBanner — bottom-docked auto-updater status banner.
 *
 * Props:
 *   updateStatus: null | { status: 'checking'|'none'|'available'|'downloading'|'ready', version?, percent?, releaseNotes? }
 *   onDismiss: () => void  — clears transient states (checking/up-to-date)
 */
export default function UpdateBanner({ updateStatus, onDismiss }) {
  const [showNotes, setShowNotes] = useState(false)

  if (!updateStatus) return null

  const { status, version, percent, releaseNotes, message } = updateStatus

  if (status === 'error') {
    return (
      <div style={barStyle('#f8d7da', '#f5c2c7')}>
        <span className="small text-danger d-inline-flex align-items-center gap-1">
          <MaterialIcon name="error" size={14} /> Update failed{message ? `: ${message}` : ''}.
        </span>
        <Button variant="link" size="sm" className="ms-auto p-0" onClick={onDismiss}>Dismiss</Button>
      </div>
    )
  }

  if (status === 'checking') {
    return (
      <div style={barStyle('#fff', '#dee2e6')}>
        <Spinner size="sm" animation="border" />
        <span className="small text-muted">Checking for updates…</span>
      </div>
    )
  }

  if (status === 'none') {
    return (
      <div style={barStyle('#e7f1ff', '#b6d4fe')}>
        <span className="small text-primary d-inline-flex align-items-center gap-1"><MaterialIcon name={ACTION_ICONS.complete} size={14} /> You're on the latest version{version ? ` (v${version})` : ''}.</span>
        <Button variant="link" size="sm" className="ms-auto p-0" onClick={onDismiss}>Dismiss</Button>
      </div>
    )
  }

  if (status === 'downloading') {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1040,
          background: '#fff',
          borderTop: '1px solid #dee2e6',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span className="small text-muted fw-semibold">Downloading update…</span>
        <ProgressBar
          now={percent ?? 0}
          label={`${percent ?? 0}%`}
          style={{ flex: 1, height: 16, fontSize: 11 }}
          animated
        />
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <>
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1040,
            background: '#d1e7dd',
            borderTop: '2px solid #a3cfbb',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span className="small fw-semibold text-success">
            ✓ Update v{version} ready.
          </span>
          {releaseNotes && (
            <Button
              variant="link"
              size="sm"
              className="p-0"
              onClick={() => setShowNotes(true)}
            >
              What&apos;s new?
            </Button>
          )}
          <Button
            variant="success"
            size="sm"
            className="ms-auto"
            onClick={() => window.electronAPI.updater.installNow()}
          >
            Restart &amp; Install
          </Button>
        </div>

        {/* Release notes modal */}
        <Modal show={showNotes} onHide={() => setShowNotes(false)} size="lg">
          <Modal.Header closeButton>
            <Modal.Title>What&apos;s new in v{version}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {releaseNotes ? (
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(releaseNotes),
                }}
              />
            ) : (
              <p className="text-muted">No release notes available.</p>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowNotes(false)}>Close</Button>
            <Button variant="success" onClick={() => window.electronAPI.updater.installNow()}>
              Restart &amp; Install
            </Button>
          </Modal.Footer>
        </Modal>
      </>
    )
  }

  // status === 'available' — download starting or queued
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1040,
        background: '#fff3cd',
        borderTop: '1px solid #ffc107',
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span className="small text-dark">
        Update v{version} available — downloading…
      </span>
    </div>
  )
}
