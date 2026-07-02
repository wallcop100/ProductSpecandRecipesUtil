import React from 'react'
import { Alert, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

/**
 * FileWatchBanner — sticky top banner shown when a watched file changes on disk.
 */
export default function FileWatchBanner() {
  const fileWatchAlert = useStore(s => s.fileWatchAlert)
  const dismissFileWatchAlert = useStore(s => s.dismissFileWatchAlert)
  const reloadFileFromDisk = useStore(s => s.reloadFileFromDisk)
  const psChanges = useStore(s => s.psChanges)
  const rsChanges = useStore(s => s.rsChanges)

  if (!fileWatchAlert) return null

  const { file, path: filePath } = fileWatchAlert
  const fileLabel = file === 'ps' ? 'Product Spec' : 'Recipe Spec'
  const filename = filePath ? filePath.split(/[\\/]/).pop() : file

  // Check for unsaved changes for this specific file
  const hasLocalChanges = file === 'ps' ? psChanges.length > 0 : rsChanges.length > 0

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1050,
        width: '100%',
      }}
    >
      <Alert
        variant="warning"
        className="mb-0 rounded-0 py-2"
        style={{ borderRadius: 0 }}
      >
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <span className="fw-semibold d-inline-flex align-items-center gap-1">
            <MaterialIcon name="description" size={16} /> File changed on disk:
          </span>
          <code style={{ fontSize: 13 }}>{filename}</code>
          <span className="text-muted small">({fileLabel})</span>

          {hasLocalChanges && (
            <span className="text-danger fw-semibold small d-inline-flex align-items-center gap-1">
              <MaterialIcon name="warning" size={15} /> You have unsaved local changes for this file!
            </span>
          )}

          <div className="d-flex gap-1 ms-auto flex-wrap">
            {hasLocalChanges ? (
              <>
                <Button
                  variant="warning"
                  size="sm"
                  onClick={() => reloadFileFromDisk(file)}
                >
                  Reload &amp; discard my changes
                </Button>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={dismissFileWatchAlert}
                >
                  Keep my changes
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="warning"
                  size="sm"
                  onClick={() => reloadFileFromDisk(file)}
                >
                  Reload file
                </Button>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={dismissFileWatchAlert}
                >
                  Dismiss
                </Button>
              </>
            )}
          </div>
        </div>
      </Alert>
    </div>
  )
}
