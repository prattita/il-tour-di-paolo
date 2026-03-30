import { medalBadgeSizeStyles, medalBadgeTierStyles } from './medalBadgeStyles'

const labels = {
  gold: 'Gold',
  silver: 'Silver',
  bronze: 'Bronze',
  none: 'No medal',
}

export function MedalBadge({ tier, size = 'default', className = '' }) {
  const t = tier in medalBadgeTierStyles ? tier : 'none'
  const sz = medalBadgeSizeStyles[size] ?? medalBadgeSizeStyles.default
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium ${sz} ${medalBadgeTierStyles[t]} ${className}`.trim()}
    >
      {labels[t]}
    </span>
  )
}
