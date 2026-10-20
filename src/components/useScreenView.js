import { useCallback, useRef } from 'react'
import useStore from '../store/useStore'

/**
 * useScreenView(screen, key, initial) — useState that lives in the store's screenView slice,
 * so a screen's filters / selection survive App unmounting it. Session only: cleared on loadProject.
 */
export function useScreenView(screen, key, initial) {
  const init = useRef(initial).current   // a stable default, so a literal [] / {} isn't new each render
  const stored = useStore(s => s.screenView[screen]?.[key])
  const value = stored === undefined ? init : stored
  const set = useCallback(next => {
    useStore.getState().setScreenView(screen, v => ({
      [key]: typeof next === 'function' ? next(v[key] === undefined ? init : v[key]) : next,
    }))
  }, [screen, key, init])
  return [value, set]
}

/**
 * Callback ref for a scroll container: restores its last scrollTop when it mounts, remembers it
 * on scroll. A callback ref, so a container that only appears later (after a selection) still counts.
 */
export function useScrollMemory(screen, key = 'scrollTop') {
  const off = useRef(null)
  return useCallback(el => {
    off.current?.()
    off.current = null
    if (!el) return
    el.scrollTop = useStore.getState().screenView[screen]?.[key] ?? 0
    const onScroll = () => useStore.getState().setScreenView(screen, { [key]: el.scrollTop })
    el.addEventListener('scroll', onScroll, { passive: true })
    off.current = () => el.removeEventListener('scroll', onScroll)
  }, [screen, key])
}
