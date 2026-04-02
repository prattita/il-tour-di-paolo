import { inclusiveMedalCounts } from './medalTier'

/** Firestore Timestamp or missing → milliseconds for sorting. */
export function joinedAtMillis(member) {
  const j = member?.joinedAt
  if (!j) return 0
  if (typeof j.toMillis === 'function') return j.toMillis()
  if (typeof j.seconds === 'number') return j.seconds * 1000 + Math.floor((j.nanoseconds || 0) / 1e6)
  return 0
}

/**
 * Deterministic medal standings: gold → silver → bronze (inclusive counts, same as profile),
 * then earlier `joinedAt` wins.
 *
 * `activitiesForMember` lets callers rank with a per-member visibility scope.
 */
export function rankMembersForStandings(members, activities, activitiesForMember) {
  const acts = activities || []
  return [...members].sort((a, b) => {
    const actsA = typeof activitiesForMember === 'function' ? activitiesForMember(a) || [] : acts
    const actsB = typeof activitiesForMember === 'function' ? activitiesForMember(b) || [] : acts
    const ma = inclusiveMedalCounts(actsA, a.progress)
    const mb = inclusiveMedalCounts(actsB, b.progress)
    if (mb.gold !== ma.gold) return mb.gold - ma.gold
    if (mb.silver !== ma.silver) return mb.silver - ma.silver
    if (mb.bronze !== ma.bronze) return mb.bronze - ma.bronze
    return joinedAtMillis(a) - joinedAtMillis(b)
  })
}

/**
 * Rank ordinal for standings (UI language).
 * `en`: 1st, 2nd… · `es` / `it`: 1º, 2º…
 */
export function formatStandingsOrdinal(n, lang = 'en') {
  if (lang === 'es') return `${n}º`
  if (lang === 'it') return `${n}°`
  const k = n % 100
  if (k >= 11 && k <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
