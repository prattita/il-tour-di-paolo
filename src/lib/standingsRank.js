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
 */
export function rankMembersForStandings(members, activities) {
  const acts = activities || []
  return [...members].sort((a, b) => {
    const ma = inclusiveMedalCounts(acts, a.progress)
    const mb = inclusiveMedalCounts(acts, b.progress)
    if (mb.gold !== ma.gold) return mb.gold - ma.gold
    if (mb.silver !== ma.silver) return mb.silver - ma.silver
    if (mb.bronze !== ma.bronze) return mb.bronze - ma.bronze
    return joinedAtMillis(a) - joinedAtMillis(b)
  })
}

/** English ordinal for rank display (1 → "1st"). */
export function formatStandingsOrdinal(n) {
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
