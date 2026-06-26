import React, { useState, useEffect } from 'react'
import { Modal, Button, Form, Badge, ListGroup } from 'react-bootstrap'

/**
 * ProjectConfirmModal — confirm the Project ID and choose/create a config before
 * opening. Shown both when opening a folder and when resuming on startup.
 *
 * Props:
 *   show
 *   suggestedNumber   — project number detected from the filename (editable)
 *   existingConfigs   — [{ id, config_name, project_number, last_opened }] for this folder
 *   preselectConfig   — config_name to preselect (e.g. last opened)
 *   onCancel()
 *   onConfirm({ projectNumber, configName })
 */
export default function ProjectConfirmModal({
  show, suggestedNumber, existingConfigs = [], preselectConfig, onCancel, onConfirm,
}) {
  const [projectNumber, setProjectNumber] = useState('')
  const [mode, setMode] = useState('existing')   // 'existing' | 'new'
  const [selectedConfig, setSelectedConfig] = useState('')
  const [newConfigName, setNewConfigName] = useState('Base')

  useEffect(() => {
    if (!show) return
    setProjectNumber(suggestedNumber || '')
    if (existingConfigs.length > 0) {
      setMode('existing')
      const pre = existingConfigs.find(c => c.config_name === preselectConfig)
      setSelectedConfig((pre || existingConfigs[0]).config_name)
    } else {
      setMode('new')
      setNewConfigName('Base')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  function handleConfirm() {
    const configName = mode === 'existing' ? selectedConfig : (newConfigName.trim() || 'Base')
    onConfirm({ projectNumber: projectNumber.trim(), configName })
  }

  const canConfirm = mode === 'existing' ? !!selectedConfig : !!newConfigName.trim()

  return (
    <Modal show={show} onHide={onCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 16 }}>Confirm project</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold d-flex align-items-center gap-2">
            Project ID
            <Badge bg="success" pill style={{ fontSize: 12 }}>{projectNumber || '—'}</Badge>
          </Form.Label>
          <Form.Control
            value={projectNumber}
            onChange={e => setProjectNumber(e.target.value)}
            placeholder="e.g. 4521"
          />
          <Form.Text className="text-muted">
            Detected from the filename — edit if it's wrong.
          </Form.Text>
        </Form.Group>

        <Form.Label className="fw-semibold">Configuration</Form.Label>

        {existingConfigs.length > 0 && (
          <>
            <Form.Check
              type="radio" id="cfg-existing" name="cfgmode" className="mb-1"
              label="Open an existing config"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
            />
            <ListGroup className="mb-3" style={{ maxHeight: 160, overflowY: 'auto' }}>
              {existingConfigs.map(c => (
                <ListGroup.Item
                  key={c.id}
                  action
                  active={mode === 'existing' && selectedConfig === c.config_name}
                  onClick={() => { setMode('existing'); setSelectedConfig(c.config_name) }}
                  className="d-flex align-items-center gap-2 py-2"
                >
                  <Badge bg="secondary">{c.config_name}</Badge>
                  {c.project_number && <Badge bg="success" pill style={{ fontSize: 10 }}>{c.project_number}</Badge>}
                  {c.last_opened && (
                    <span className="text-muted ms-auto" style={{ fontSize: 11 }}>
                      {new Date(c.last_opened).toLocaleDateString()}
                    </span>
                  )}
                </ListGroup.Item>
              ))}
            </ListGroup>
          </>
        )}

        <Form.Check
          type="radio" id="cfg-new" name="cfgmode" className="mb-1"
          label="Create a new config"
          checked={mode === 'new'}
          onChange={() => setMode('new')}
        />
        {mode === 'new' && (
          <Form.Control
            value={newConfigName}
            onChange={e => setNewConfigName(e.target.value)}
            placeholder="Config name (e.g. Base, Phase 2)"
            className="mt-1"
          />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!canConfirm}>
          Open project
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
