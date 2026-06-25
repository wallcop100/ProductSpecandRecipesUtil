import React, { useState } from 'react'
import { Alert, Button, ProgressBar, Modal } from 'react-bootstrap'
import DOMPurify from 'dompurify'

/**
 * UpdateBanner — bottom-docked auto-updater status banner.
 *
 * Props:
 *   updateStatus: null | { status: 'available'|'downloading'|'ready', version?, percent?, releaseNotes? }
 */
export default function UpdateBanner({ updateStatus }) {
  const [showNotes, setShowNotes] = useState(false)

  if (!updateStatus) return null

  const { status, version, percent, releaseNotes } = updateStatus

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
