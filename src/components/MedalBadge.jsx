import { useTranslation } from '../hooks/useTranslation'
import { medalBadgeSizeStyles, medalBadgeTierStyles } from './medalBadgeStyles'

const TIER_KEYS = {
  gold: 'medals.gold',
  silver: 'medals.silver',
  bronze: 'medals.bronze',
  none: 'medals.none',
}

export function MedalBadge({ tier, size = 'default', className = '' }) {
  const { t } = useTranslation()
  const tTier = tier in medalBadgeTierStyles ? tier : 'none'
  const sz = medalBadgeSizeStyles[size] ?? medalBadgeSizeStyles.default
  const labelKey = TIER_KEYS[tTier]
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium ${sz} ${medalBadgeTierStyles[tTier]} ${className}`.trim()}
    >
      {t(labelKey)}
    </span>
  )
}
