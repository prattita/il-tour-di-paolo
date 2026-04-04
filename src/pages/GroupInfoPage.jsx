import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { activityVisibleOnParticipationSurfaces } from '../lib/activityVisibility'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import {
  subscribeActivities,
  subscribeActivitiesForViewer,
  subscribeGroupMembers,
} from '../services/activityService'
import { getCompoundTarget, isCompoundTask } from '../lib/compoundTask'
import { getGroup } from '../services/groupService'

export function GroupInfoPage() {
  const { t } = useTranslation()
  const { groupId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [activities, setActivities] = useState([])
  const [expandedActivityIds, setExpandedActivityIds] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function run() {
      if (!groupId) return
      setLoading(true)
      setError('')
      try {
        const g = await getGroup(groupId)
        if (active) setGroup(g)
      } catch (e) {
        if (active) setError(e.message || t('groupInfo.loadFailed'))
      } finally {
        if (active) setLoading(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [groupId, t])

  const isMember = Boolean(user?.uid && group?.memberIds?.includes(user.uid))
  const isOwner = Boolean(user?.uid && group?.ownerId === user.uid)
  const visibleActivities = useMemo(() => {
    if (isOwner) return activities
    if (!user?.uid) return []
    return activities.filter((a) =>
      activityVisibleOnParticipationSurfaces(a, user.uid, group?.ownerId),
    )
  }, [activities, isOwner, user?.uid, group?.ownerId])

  const activityNameById = Object.fromEntries(
    activities.map((a) => [a.id, a.name || t('feed.activityFallback')]),
  )

  const memberDisplayNameById = useMemo(
    () =>
      Object.fromEntries(
        members.map((m) => [
          m.id,
          m.displayName || t('groupShell.displayNameFallback'),
        ]),
      ),
    [members, t],
  )

  useEffect(() => {
    if (!groupId || !isMember || !user?.uid) return
    const unsubM = subscribeGroupMembers(
      groupId,
      (list) => setMembers(list),
      () => setMembers([]),
    )
    const unsubA = isOwner
      ? subscribeActivities(groupId, (list) => setActivities(list), () => setActivities([]))
      : subscribeActivitiesForViewer(
          groupId,
          user.uid,
          group?.ownerId,
          (list) => setActivities(list),
          () => setActivities([]),
        )
    return () => {
      unsubM()
      unsubA()
    }
  }, [groupId, isMember, isOwner, user?.uid, group?.ownerId])

  function toggleActivityExpanded(id) {
    setExpandedActivityIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return <p className="text-sm text-tour-text-secondary">{t('groupInfo.loading')}</p>
  }
  if (error) {
    return <p className="text-sm text-red-800">{error}</p>
  }
  if (!group) {
    return <p className="text-sm text-tour-text-secondary">{t('feed.groupNotFound')}</p>
  }
  if (!isMember) {
    return <p className="text-sm text-tour-text-secondary">{t('feed.notMember')}</p>
  }

  return (
    <div className="space-y-4 text-tour-text">
      <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
        <h1 className="text-lg font-medium text-tour-text">{group.name}</h1>
        {group.description ? (
          <p className="mt-2 text-sm leading-relaxed text-tour-text-secondary">{group.description}</p>
        ) : (
          <p className="mt-2 text-sm text-tour-text-secondary">{t('groupInfo.noDescription')}</p>
        )}
        {isOwner && (
          <Link
            to={`/group/${groupId}/settings`}
            className="mt-3 inline-flex rounded-lg border border-tour-accent/40 bg-tour-accent-muted/60 px-3 py-2 text-[12px] font-medium text-tour-accent-foreground hover:opacity-95"
          >
            {t('groupInfo.editGroupInvite')}
          </Link>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
          {t('groupInfo.membersHeading')}
        </h2>
        {members.length === 0 ? (
          <p className="mt-2 text-sm text-tour-text-secondary">{t('groupInfo.noMembersLoaded')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10">
            {members.map((m) => {
              const rowOwner = m.id === group.ownerId
              return (
                <li key={m.id} className="min-w-0 py-3 first:pt-0 last:pb-0">
                  <Link
                    to={`/group/${groupId}/profile/${m.id}`}
                    className="-mx-2 flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 text-tour-text hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent"
                  >
                    <Avatar
                      avatarUrl={m.avatarUrl}
                      displayName={m.displayName}
                      seed={m.id}
                      className="h-10 w-10 text-[12px]"
                      alt=""
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium">
                        {m.displayName || t('groupShell.displayNameFallback')}
                      </span>
                      {rowOwner && (
                        <span className="ml-2 rounded bg-tour-muted px-1.5 py-0.5 text-[10px] font-medium text-tour-text-secondary">
                          {t('groupShell.ownerTag')}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
            {t('groupInfo.activitiesHeading')}
          </h2>
          <Link
            to={`/group/${groupId}/activities`}
            className="text-[11px] font-medium text-tour-accent underline"
          >
            {t('groupInfo.viewAllActivities')}
          </Link>
        </div>
        {visibleActivities.length === 0 ? (
          <p className="mt-2 text-sm text-tour-text-secondary">
            {isOwner ? t('groupInfo.noActivitiesOwner') : t('groupInfo.noActivitiesMember')}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {visibleActivities.map((a) => {
              const open = expandedActivityIds.has(a.id)
              const advanced = a.isAdvanced === true
              const personal = a.isPersonal === true
              const cardClass = advanced
                ? 'border-violet-200 bg-violet-50/40'
                : personal
                  ? 'border-amber-200 bg-amber-50/40'
                  : 'border-black/10'
              const hoverClass = advanced
                ? 'hover:bg-violet-100/50'
                : personal
                  ? 'hover:bg-amber-100/50'
                  : 'hover:bg-black/[0.03]'
              return (
                <li
                  key={a.id}
                  className={['overflow-hidden rounded-lg border', cardClass].join(' ')}
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleActivityExpanded(a.id)}
                    className={['flex w-full items-center gap-2 px-3 py-2.5 text-left', hoverClass].join(
                      ' ',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="min-w-0 text-[13px] font-medium leading-snug text-tour-text">
                          {a.name}
                        </span>
                        {advanced ? (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-violet-800">
                            {t('activities.advancedBadge')}
                          </span>
                        ) : null}
                        {personal ? (
                          <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-amber-900">
                            {t('activities.personalBadge')}
                          </span>
                        ) : null}
                      </span>
                      {advanced && a.prerequisiteActivityId ? (
                        <span className="mt-0.5 block text-[11px] font-normal text-violet-800/85">
                          {t('activities.advancedTrackOf', {
                            name:
                              activityNameById[a.prerequisiteActivityId] ||
                              t('activities.prerequisiteFallback'),
                          })}
                        </span>
                      ) : null}
                      {personal ? (
                        <span className="mt-0.5 block text-[11px] font-normal text-amber-900/85">
                          {typeof a.assignedUserId === 'string' && a.assignedUserId
                            ? t('activities.personalAssignedToLine', {
                                name:
                                  memberDisplayNameById[a.assignedUserId] ||
                                  t('groupShell.displayNameFallback'),
                              })
                            : t('activities.personalUnassignedGroupInfo')}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-tour-text-secondary" aria-hidden>
                      {open ? '▲' : '▼'}
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-black/10 px-3 py-3">
                      {a.description ? (
                        <p className="text-[12px] leading-relaxed text-tour-text-secondary">
                          {a.description}
                        </p>
                      ) : null}
                      <ul
                        className={
                          a.description ? 'mt-3 space-y-2' : 'space-y-2'
                        }
                      >
                        {(a.tasks || []).map((task) => (
                          <li key={task.id} className="flex gap-2 text-[12px] text-tour-text">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tour-accent" />
                            <span>
                              {task.name}
                              {isCompoundTask(task) ? (
                                <span className="text-tour-text-secondary">
                                  {' '}
                                  ({t('groupInfo.compoundTimes', { n: getCompoundTarget(task) })})
                                </span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
