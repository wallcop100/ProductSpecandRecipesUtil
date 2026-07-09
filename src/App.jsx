import React, { useState, useEffect } from 'react'
import useStore from './store/useStore'
import FolderSetupScreen from './screens/FolderSetupScreen'
import BuilderScreen from './screens/BuilderScreen'
import TemplateEditorScreen from './screens/TemplateEditorScreen'
import ProductSpecScreen from './screens/ProductSpecScreen'
import ProductCodeImportScreen from './screens/ProductCodeImportScreen'
import ConnectorsScreen from './screens/ConnectorsScreen'
import TagManagerScreen from './screens/TagManagerScreen'
import FileWatchBanner from './components/FileWatchBanner'

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
  // the product-code import's "review what was prefilled" hand-off)
  const [reviewPositionRefs, setReviewPositionRefs] = useState(null)
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

  return (
    <div className={debugIds ? 'debug-ids' : ''} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <FileWatchBanner />

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
            onOpenTags={() => navigateTo('tags')}
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
            onOpenCodeImport={() => navigateTo('product-code-import')}
            onBack={() => {
              setPsScrollToRef(null)
              navigateTo('builder')
            }}
          />
        )}
        {activeScreen === 'product-code-import' && (
          <ProductCodeImportScreen
            onBack={() => navigateTo('product-spec')}
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
        {activeScreen === 'tags' && (
          <TagManagerScreen onBack={() => navigateTo('builder')} />
        )}
      </div>

    </div>
  )
}
