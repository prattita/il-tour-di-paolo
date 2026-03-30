/** Shared feed post presentation helpers. */

export function formatFeedTime(value) {
  if (!value) return ''
  const d = typeof value.toDate === 'function' ? value.toDate() : value
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''

  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 0) {
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.floor((startOf(new Date(now)) - startOf(d)) / 86_400_000)
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'short' })
  }

  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

export function medalTierForPost(medal) {
  if (medal === 'gold' || medal === 'silver' || medal === 'bronze') return medal
  return 'none'
}
