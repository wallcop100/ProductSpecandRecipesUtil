import React, { useState, useEffect } from 'react'
import useStore from './store/useStore'
import FolderSetupScreen from './screens/FolderSetupScreen'
import BuilderScreen from './screens/BuilderScreen'
import TemplateEditorScreen from './screens/TemplateEditorScreen'
import ProductSpecScreen from './screens/ProductSpecScreen'
import FileWatchBanner from './components/FileWatchBanner'
import UpdateBanner from './components/UpdateBanner'

/**
 * App — top-level screen router.
 * Screens: 'folder-setup' | 'builder' | 'template-editor' | 'product-spec'
 */
export default function App() {
  const [activeScreen, setActiveScreen] = useState('folder-setup')
  // scrollToRef: ET ref to auto-scroll to when opening Product Spec
  const [psScrollToRef, setPsScrollToRef] = useState(null)
  const [updateStatus, setUpdateStatus] = useState(null)
  // updateStatus shape: { status: 'available'|'downloading'|'ready', version, percent, releaseNotes }

  const setFileWatchAlert = useStore(s => s.setFileWatchAlert)

  useEffect(() => {
    // Listen for file-changed events from the main process
    if (window.electronAPI?.onFileChanged) {
      window.electronAPI.onFileChanged((data) => {
        setFileWatchAlert(data)
      })
    }

    // Listen for auto-updater status changes
    if (window.electronAPI?.updater?.onStatusChange) {
      window.electronAPI.updater.onStatusChange((data) => {
        setUpdateStatus(data)
      })
    }
  }, [setFileWatchAlert])

  function navigateTo(screen) {
    setActiveScreen(screen)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
            onBackToSetup={() => navigateTo('folder-setup')}
          />
        )}
        {activeScreen === 'template-editor' && (
          <TemplateEditorScreen onBack={() => navigateTo('builder')} />
        )}
        {activeScreen === 'product-spec' && (
          <ProductSpecScreen
            scrollToRef={psScrollToRef}
            onBack={() => {
              setPsScrollToRef(null)
              navigateTo('builder')
            }}
          />
        )}
      </div>

      <UpdateBanner updateStatus={updateStatus} />
    </div>
  )
}
