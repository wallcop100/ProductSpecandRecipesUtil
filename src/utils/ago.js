/**
 * ago(iso) → "just now" | "12m ago" | "2h ago" | "3d ago" | null
 *
 * Enough to know whether the thing you are looking at is the current one. Returns
 * null for anything unparseable or in the future — a wrong answer is worse than none.
 */
export function ago(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
