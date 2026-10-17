/**
 * run.js — the context an action runs with (help/actions.js `run(ctx)`): ways to get somewhere and
 * open the right thing there, all through the store's one-shot requests, so an action needs no
 * props from the screen it happens to be called on.
 *
 * `host(kind, props)` and `tutorial(id)` are the palette's own: it shows those windows itself.
 */
import useStore, { savePendingNow } from '../store/useStore'

export function contextFor({ ref = null, pos = null, host = () => {}, tutorial = () => {} } = {}) {
  const s = useStore.getState()
  return {
    s, ref, pos, host, tutorial,
    go: screen => s.requestScreen(screen),
    spec: (r, open = null, suggest = null) => (r ? s.openSpec(r, open, suggest) : s.requestScreen('product-spec')),
    ui: (kind, args) => s.requestUi(kind, args),
    openPosition: p => {
      if (p) s.setActivePosition(p)
      s.requestScreen('builder')
      s.requestUi('positionsView')
    },
    saveNow: () => savePendingNow(),
  }
}
