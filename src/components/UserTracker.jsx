import { Link } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import { Avatar } from './Avatar'
import { MedalBadge } from './MedalBadge'
import { inclusiveMedalCounts } from '../lib/medalTier'
import { StandingsRankMarker } from './StandingsRankMarker'

const SUMMARY_BADGE_W = 'w-[3.25rem]'

/**
 * @param {{
 *   member: { id: string, displayName?: string | null, avatarUrl?: string | null, progress?: object },
 *   rank: number,
 *   variant: 'full' | 'compact',
 *   isCurrentUser?: boolean,
 *   activities: Array<{ id: string }>,
 *   totalOverride?: number,
 *   countsOverride?: { gold: number, silver: number, bronze: number },
 *   groupId: string,
 * }} props
 */
export function UserTracker({
  member,
  rank,
  variant,
  isCurrentUser = false,
  activities,
  totalOverride,
  countsOverride,
  groupId,
}) {
  const { t } = useTranslation()
  const computedTotal = activities?.length ?? 0
  const computedCounts = inclusiveMedalCounts(activities || [], member?.progress)
  const total = Number.isFinite(totalOverride) ? totalOverride : computedTotal
  const counts = countsOverride || computedCounts
  const profilePath = `/group/${groupId}/profile/${member.id}`
  const name = member.displayName || t('groupShell.displayNameFallback')

  if (variant === 'compact') {
    return (
      <Link
        to={profilePath}
        className={[
          'flex max-w-[9.5rem] shrink-0 items-center gap-2 rounded-lg px-1.5 py-1 text-tour-text no-underline',
          'hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent',
          isCurrentUser ? 'ring-2 ring-tour-accent ring-offset-1 ring-offset-tour-surface' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Avatar
          avatarUrl={member.avatarUrl}
          displayName={name}
          seed={member.id}
          className="h-8 w-8 shrink-0 text-[11px]"
          alt=""
        />
        <div className="min-w-0 flex flex-1 flex-col gap-0.5">
          <span className="truncate text-[11px] font-medium leading-tight">{name}</span>
          <StandingsRankMarker rank={rank} size="sm" />
        </div>
      </Link>
    )
  }

  return (
    <Link
      to={profilePath}
      className={[
        'block rounded-xl border border-black/10 bg-tour-surface px-3 py-3 no-underline transition-colors',
        'hover:bg-black/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent',
        isCurrentUser ? 'bg-tour-accent-muted/50 border-tour-accent/25' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center gap-3">
        <StandingsRankMarker rank={rank} size="md" />
        <Avatar
          avatarUrl={member.avatarUrl}
          displayName={name}
          seed={member.id}
          className="h-11 w-11 text-[13px] shrink-0"
          alt=""
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-tour-text">{name}</p>
          {total === 0 ? (
            <p className="mt-1 text-[12px] text-tour-text-secondary">
              {t('standings.noActivitiesForMember')}
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="inline-flex items-center gap-1">
                <MedalBadge tier="gold" size="sm" className={SUMMARY_BADGE_W} />
                <span className="text-[12px] tabular-nums text-tour-text">
                  {counts.gold}/{total}
                </span>
              </span>
              <span className="inline-flex items-center gap-1">
                <MedalBadge tier="silver" size="sm" className={SUMMARY_BADGE_W} />
                <span className="text-[12px] tabular-nums text-tour-text">
                  {counts.silver}/{total}
                </span>
              </span>
              <span className="inline-flex items-center gap-1">
                <MedalBadge tier="bronze" size="sm" className={SUMMARY_BADGE_W} />
                <span className="text-[12px] tabular-nums text-tour-text">
                  {counts.bronze}/{total}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
