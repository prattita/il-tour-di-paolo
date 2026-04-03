/** Shared feed post presentation helpers. */

/**
 * Recover actor + activity from the English system line written by {@link addGroupActivity}
 * (`${who} added a new activity: ${name}`). Used when the UI should localize but `message`
 * was persisted in English.
 *
 * @param {unknown} message
 * @returns {{ actor: string, activity: string } | null}
 */
export function parseActivityAddedEnglishMessage(message) {
  if (typeof message !== 'string') return null
  const m = message.trim().match(/^(.+?) added a new activity: (.+)$/)
  if (!m) return null
  const actor = m[1].trim()
  const activity = m[2].trim()
  if (!activity) return null
  return { actor, activity }
}

/**
 * @param {unknown} value
 * @param {{ t: (key: string, vars?: object) => string, language?: string }} i18n
 */
export function formatFeedTime(value, i18n) {
  const { t, language = 'en' } = i18n || {}
  if (!t) return ''
  if (!value) return ''
  const d = typeof value.toDate === 'function' ? value.toDate() : value
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''

  const locale = language || 'en'

  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 0) {
    return d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
  }

  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return t('feed.relativeJustNow')
  if (diffMin < 60) return t('feed.relativeMinutesAgo', { count: diffMin })

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return t('feed.relativeHoursAgo', { count: diffHr })

  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.floor((startOf(new Date(now)) - startOf(d)) / 86_400_000)
  if (dayDiff === 1) return t('feed.relativeYesterday')
  if (dayDiff < 7) {
    return d.toLocaleDateString(locale, { weekday: 'short' })
  }

  return d.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

export function medalTierForPost(medal) {
  if (medal === 'gold' || medal === 'silver' || medal === 'bronze') return medal
  return 'none'
}
