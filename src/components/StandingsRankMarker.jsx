import { useTranslation } from '../hooks/useTranslation'
import { formatStandingsOrdinal } from '../lib/standingsRank'
import { medalBadgeSizeStyles, medalBadgeTierStyles } from './medalBadgeStyles'

function tierForStandingsRank(rank) {
  if (rank === 1) return 'gold'
  if (rank === 2) return 'silver'
  if (rank === 3) return 'bronze'
  return 'none'
}

/**
 * Rank ordinals in the same pill surfaces as `MedalBadge` (podium → gold/silver/bronze; else neutral).
 */
export function StandingsRankMarker({ rank, size = 'md' }) {
  const { language } = useTranslation()
  const ordinal = formatStandingsOrdinal(rank, language)
  const tier = tierForStandingsRank(rank)
  const surface = medalBadgeTierStyles[tier]
  const sz = size === 'sm' ? medalBadgeSizeStyles.sm : medalBadgeSizeStyles.default
  const minW = size === 'sm' ? 'min-w-[2.25rem]' : 'min-w-[2.75rem]'
  const base = `inline-flex ${minW} shrink-0 items-center justify-center whitespace-nowrap rounded-full font-medium tabular-nums`

  return (
    <span className={`${base} ${sz} ${surface}`} aria-label={ordinal}>
      {ordinal}
    </span>
  )
}
