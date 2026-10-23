import BugReporter from './components/BugReporter'
import UndoShortcut from './components/UndoShortcut'
import DesignPickerModal from './components/DesignPickerModal'
import { SaveShortcut } from './components/SaveStatus'
import React, { useState, useEffect } from 'react'
import useStore from './store/useStore'
import FolderSetupScreen from './screens/FolderSetupScreen'
import BuilderScreen from './screens/BuilderScreen'
import TemplateEditorScreen from './screens/TemplateEditorScreen'
import ProductSpecScreen from './screens/ProductSpecScreen'
import ProductCodeImportScreen from './screens/ProductCodeImportScreen'
import ConnectorsScreen from './screens/ConnectorsScreen'
import PatchSyncPanel from './components/PatchSyncPanel'
import FindPalette from './components/FindPalette'
import ErrorBoundary from './components/ErrorBoundary'
import ConfirmHost from './components/ConfirmHost'
import { APP_CHANNEL } from './utils/bugReports'
import { C } from './styles/tokens'

// The short commit this build was made from; 'local' when there is no stamp (tests, an unstamped build).
const BUILD = (document.querySelector('meta[name="build-commit"]')?.getAttribute('content') || 'local').slice(0, 7)
// Positive adjectives and colours: either reads well before an animal, so both widen the name space.
const ADJECTIVES = ['Brave', 'Bright', 'Calm', 'Clever', 'Cosy', 'Daring', 'Eager', 'Gentle', 'Glad', 'Happy', 'Jolly', 'Keen', 'Kind', 'Lucky', 'Merry', 'Mighty',
  'Nimble', 'Noble', 'Plucky', 'Proud', 'Quick', 'Quiet', 'Sunny', 'Swift', 'Tidy', 'Trusty', 'Witty', 'Zesty', 'Bold', 'Cheery', 'Fair', 'Wise',
  'Amber', 'Azure', 'Coral', 'Crimson', 'Cobalt', 'Copper', 'Golden', 'Indigo', 'Ivory', 'Jade', 'Lemon', 'Lilac', 'Magenta', 'Maroon', 'Mint', 'Navy',
  'Olive', 'Peach', 'Pearl', 'Plum', 'Rose', 'Ruby', 'Russet', 'Saffron', 'Sage', 'Scarlet', 'Silver', 'Teal', 'Topaz', 'Violet', 'Amethyst', 'Emerald']
const ANIMALS = ['Otter', 'Badger', 'Fox', 'Heron', 'Hare', 'Owl', 'Wren', 'Robin', 'Seal', 'Puffin', 'Lynx', 'Panda', 'Koala', 'Gecko', 'Llama', 'Bison',
  'Falcon', 'Beaver', 'Moose', 'Newt', 'Orca', 'Raven', 'Stoat', 'Tiger', 'Walrus', 'Yak', 'Zebra', 'Dingo', 'Ferret', 'Ibex', 'Mole', 'Swan',
  'Alpaca', 'Bear', 'Camel', 'Crane', 'Deer', 'Dolphin', 'Eagle', 'Elk', 'Finch', 'Gazelle', 'Goose', 'Hedgehog', 'Jaguar', 'Kestrel', 'Lemur', 'Lion',
  'Magpie', 'Marten', 'Meerkat', 'Osprey', 'Panther', 'Pelican', 'Penguin', 'Rabbit', 'Salmon', 'Sparrow', 'Squirrel', 'Starling', 'Toucan', 'Turtle', 'Vole', 'Wolf']
// The build's name, picked by its commit (bug reports carry the full hash): 4,096 names, so a repeat is rare.
const BUILD_NAME = /^[0-9a-f]{4}/.test(BUILD)
  ? `${ADJECTIVES[parseInt(BUILD.slice(0, 2), 16) % 64]} ${ANIMALS[parseInt(BUILD.slice(2, 4), 16) % 64]}` : BUILD

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
  // Came from a By-position import: the builder offers the way back to the next position.
  const [importLoop, setImportLoop] = useState(null)   // { refs } | null
  // Where the product-code import was opened from, so Back returns there rather
  // than always dumping you on the Product Spec.
  const [importOrigin, setImportOrigin] = useState('builder')
  const [debugIds, setDebugIds] = useState(false)

  const setFileWatchAlert = useStore(s => s.setFileWatchAlert)
  const setRootView = useStore(s => s.setRootView)

  useEffect(() => {
    // The file watcher polls the project folder and reports external edits.
    if (window.electronAPI?.onFileChanged) {
      // A workbook changed and settled: check all three against the pending changes. Several
      // files settling together (a run of patches) is one check.
      let timer = null
      window.electronAPI.onFileChanged((data) => {
        setFileWatchAlert(data)
        clearTimeout(timer)
        timer = setTimeout(() => { useStore.getState().checkFiles() }, 1500)
      })
    }

    // Debug menu → toggle the UI-element-ID overlay
    if (window.electronAPI?.onDebugToggle) {
      window.electronAPI.onDebugToggle((on) => setDebugIds(!!on))
    }
  }, [setFileWatchAlert])

  function navigateTo(screen) {
    // Leaving the builder is leaving its position: settle that recipe's design item first.
    if (activeScreen === 'builder' && screen !== 'builder') {
      useStore.getState().leavePosition(useStore.getState().activePositionRef, () => setActiveScreen(screen))
      return
    }
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
    <div className={debugIds ? 'debug-ids' : ''} data-screen={activeScreen} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* The build this is (index.html's build-commit stamp), bottom-right on every page so a screenshot names it; never in the way of a click. */}
      {/* Dev is always red, so a dev screenshot can't pass for prod. */}
      <span data-testid="build-badge"
        style={{ position: 'fixed', bottom: 4, right: 8, zIndex: 2000, pointerEvents: 'none',
          fontFamily: 'Arial, sans-serif', fontSize: 11, color: APP_CHANNEL === 'dev' ? C.danger : C.muted }}>
        {APP_CHANNEL === 'dev' ? 'DEV · ' : ''}{BUILD_NAME}
      </span>
      <BugReporter screen={activeScreen} />
      <FindPalette screen={activeScreen} />
      <PatchSyncPanel />
      <DesignPickerModal />
      <ConfirmHost />
      <SaveShortcut />
      <UndoShortcut screen={activeScreen} />

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
              // An explicit target opens a fresh view on it; no target returns to the remembered one.
              if (etRef) useStore.getState().clearScreenView('product-spec')
              setPsScrollToRef(etRef || null)
              navigateTo('product-spec')
            }}
            onOpenConnectors={(posRef) => {
              if (posRef) useStore.getState().clearScreenView('connectors')
              setConnectorsFocusRef(posRef || null)
              navigateTo('connectors')
            }}
            onOpenCodeImport={() => openCodeImport('builder')}
            onBackToSetup={() => navigateTo('folder-setup')}
            pendingReviewRefs={reviewPositionRefs}
            onConsumePendingReview={() => setReviewPositionRefs(null)}
            importLoop={importLoop}
            onNextFromImport={() => { setImportLoop(null); navigateTo('product-code-import') }}
            onEndImportLoop={() => setImportLoop(null)}
          />
        )}
        {activeScreen === 'template-editor' && (
          <TemplateEditorScreen onBack={() => navigateTo('builder')} />
        )}
        {activeScreen === 'product-spec' && (
          <ProductSpecScreen
            scrollToRef={psScrollToRef}
            onOpenCodeImport={() => { setPsScrollToRef(null); openCodeImport('product-spec') }}
            onOpenPosition={ref => {
              setPsScrollToRef(null)
              useStore.getState().openPositionFrom('product-spec', ref)
              navigateTo('builder')
            }}
            onBack={() => {
              setPsScrollToRef(null)
              navigateTo('builder')
            }}
          />
        )}
        {activeScreen === 'product-code-import' && (
          <ProductCodeImportScreen
            onBack={() => navigateTo(importOrigin)}
            onReviewPositions={(refs, opts) => {
              setImportLoop(opts?.fromImport ? { refs } : null)
              setReviewPositionRefs(refs); navigateTo('builder')
            }}
          />
        )}
        {activeScreen === 'connectors' && (
          <ConnectorsScreen
            focusPosRef={connectorsFocusRef}
            onOpenPosition={(posRef) => {
              setRootView('positions')
              useStore.getState().openPositionFrom('connectors', posRef)
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
