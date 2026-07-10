import React, { useState, useEffect } from 'react'
import useStore from './store/useStore'
import FolderSetupScreen from './screens/FolderSetupScreen'
import BuilderScreen from './screens/BuilderScreen'
import TemplateEditorScreen from './screens/TemplateEditorScreen'
import ProductSpecScreen from './screens/ProductSpecScreen'
import ProductCodeImportScreen from './screens/ProductCodeImportScreen'
import ConnectorsScreen from './screens/ConnectorsScreen'
import FileWatchBanner from './components/FileWatchBanner'
import ErrorBoundary from './components/ErrorBoundary'

/**
 * App — top-level screen router.
 * Screens: 'folder-setup' | 'builder' | 'template-editor' | 'product-spec' |
 *          'product-code-import' | 'connectors'
 */
export default function App() {
  const [activeScreen, setActiveScreen] = useState('folder-setup')
  // scrollToRef: ET ref to auto-scroll to when opening Product Spec
  const [psScrollToRef, setPsScrollToRef] = useState(null)
  // connectorsFocusRef: position ref to focus when opening the Connectors screen
  const [connectorsFocusRef, setConnectorsFocusRef] = useState(null)
  // reviewPositionRefs: PositionTypeRefs to jump straight into reviewing (e.g. from
  // the product-code import's "review what the Form named" hand-off)
  const [reviewPositionRefs, setReviewPositionRefs] = useState(null)
  // Where the product-code import was opened from, so Back returns there rather
  // than always dumping you on the Product Spec.
  const [importOrigin, setImportOrigin] = useState('builder')
  const [debugIds, setDebugIds] = useState(false)

  const setFileWatchAlert = useStore(s => s.setFileWatchAlert)
  const setActivePosition = useStore(s => s.setActivePosition)
  const setRootView = useStore(s => s.setRootView)

  useEffect(() => {
    // The file watcher polls the project folder and reports external edits.
    if (window.electronAPI?.onFileChanged) {
      window.electronAPI.onFileChanged((data) => {
        setFileWatchAlert(data)
      })
    }

    // Debug menu → toggle the UI-element-ID overlay
    if (window.electronAPI?.onDebugToggle) {
      window.electronAPI.onDebugToggle((on) => setDebugIds(!!on))
    }
  }, [setFileWatchAlert])

  function navigateTo(screen) {
    setActiveScreen(screen)
  }

  // A one-shot screen request from deep in the tree. FormSpecPane sits four levels
  // down (and again inside ReviewModal), so it cannot reach navigateTo through
  // props. Same shape as the reviewPositionRefs hand-off above.
  const pendingScreen = useStore(s => s.pendingScreen)
  const consumePendingScreen = useStore(s => s.consumePendingScreen)
  useEffect(() => {
    if (!pendingScreen) return
    if (pendingScreen === 'product-code-import') setImportOrigin(activeScreen)
    navigateTo(pendingScreen)
    consumePendingScreen()
  }, [pendingScreen, consumePendingScreen, activeScreen])

  /** The one way into the Form → product-code workflow. Remembers where you were. */
  function openCodeImport(from) {
    setImportOrigin(from)
    navigateTo('product-code-import')
  }

  return (
    <div className={debugIds ? 'debug-ids' : ''} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <FileWatchBanner />

      {/* Keyed by screen: navigating away clears a caught error rather than
          stranding you on the fallback. */}
      <ErrorBoundary key={activeScreen}>
      <div style={{ flex: 1 }}>
        {activeScreen === 'folder-setup' && (
          <FolderSetupScreen onProjectLoaded={() => navigateTo('builder')} />
        )}
        {activeScreen === 'builder' && (
          <BuilderScreen
            onOpenTemplateEditor={() => navigateTo('template-editor')}
            onOpenProductSpec={(etRef) => {
              setPsScrollToRef(etRef || null)
              navigateTo('product-spec')
            }}
            onOpenConnectors={(posRef) => {
              setConnectorsFocusRef(posRef || null)
              navigateTo('connectors')
            }}
            onOpenCodeImport={() => openCodeImport('builder')}
            onBackToSetup={() => navigateTo('folder-setup')}
            pendingReviewRefs={reviewPositionRefs}
            onConsumePendingReview={() => setReviewPositionRefs(null)}
          />
        )}
        {activeScreen === 'template-editor' && (
          <TemplateEditorScreen onBack={() => navigateTo('builder')} />
        )}
        {activeScreen === 'product-spec' && (
          <ProductSpecScreen
            scrollToRef={psScrollToRef}
            onOpenCodeImport={() => openCodeImport('product-spec')}
            onBack={() => {
              setPsScrollToRef(null)
              navigateTo('builder')
            }}
          />
        )}
        {activeScreen === 'product-code-import' && (
          <ProductCodeImportScreen
            onBack={() => navigateTo(importOrigin)}
            onReviewPositions={refs => { setReviewPositionRefs(refs); navigateTo('builder') }}
          />
        )}
        {activeScreen === 'connectors' && (
          <ConnectorsScreen
            focusPosRef={connectorsFocusRef}
            onOpenPosition={(posRef) => {
              setRootView('positions')
              setActivePosition(posRef)
              setConnectorsFocusRef(null)
              navigateTo('builder')
            }}
            onBack={() => {
              setConnectorsFocusRef(null)
              navigateTo('builder')
            }}
          />
        )}
      </div>
      </ErrorBoundary>

    </div>
  )
}
