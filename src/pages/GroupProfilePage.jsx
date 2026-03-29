import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { MedalBadge } from '../components/MedalBadge'
import { subscribeActivities, subscribeGroupMember } from '../services/activityService'
import { getGroup } from '../services/groupService'
import { inclusiveMedalCounts, medalTierFromTasksCompleted } from '../lib/medalTier'

function userInitials(displayName, email) {
  const name = displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  const em = email?.trim()
  if (em) return em.slice(0, 2).toUpperCase()
  return '??'
}

/** Fixed desktop width keeps bars aligned; `className` sets width (e.g. `w-full` / `w-[140px]`). */
function ActivityProgressBar({ tasksCompleted, className = 'w-full min-w-0 sm:w-[140px] sm:shrink-0' }) {
  const n = Math.min(3, Math.max(0, Number(tasksCompleted) || 0))
  const pct = (n / 3) * 100
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-black/10 ${className}`.trim()}
      role="progressbar"
      aria-valuenow={n}
      aria-valuemin={0}
      aria-valuemax={3}
      aria-label={`${n} of 3 tasks completed`}
    >
      <div
        className="h-full rounded-full bg-tour-accent transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Fits “No medal yet” on one line at default badge size; keeps Gold/Bronze rhythm identical. */
const PROFILE_ACTIVITY_BADGE_W = 'w-[7.25rem]'
const PROFILE_SUMMARY_BADGE_W = 'w-[4.75rem]'

export function GroupProfilePage() {
  const { groupId, userId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [activities, setActivities] = useState([])
  const [subjectMember, setSubjectMember] = useState(null)
  const [listError, setListError] = useState('')

  useEffect(() => {
    let active = true
    async function run() {
      if (!groupId) return
      setLoadingGroup(true)
      try {
        const g = await getGroup(groupId)
        if (active) setGroup(g)
      } catch {
        if (active) setGroup(null)
      } finally {
        if (active) setLoadingGroup(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [groupId])

  const isMember = Boolean(user?.uid && group?.memberIds?.includes(user.uid))
  const subjectInGroup = Boolean(userId && group?.memberIds?.includes(userId))

  useEffect(() => {
    if (!groupId || !userId || !subjectInGroup) return
    setListError('')
    const unsubMember = subscribeGroupMember(
      groupId,
      userId,
      (m) => setSubjectMember(m),
      (e) => setListError(e.message || 'Failed to load profile.'),
    )
    const unsubActs = subscribeActivities(
      groupId,
      (list) => setActivities(list),
      (e) => setListError(e.message || 'Failed to load activities.'),
    )
    return () => {
      unsubMember()
      unsubActs()
    }
  }, [groupId, userId, subjectInGroup])

  const total = activities.length
  const counts = useMemo(
    () => inclusiveMedalCounts(activities, subjectMember?.progress),
    [activities, subjectMember?.progress],
  )

  const displayName = subjectMember?.displayName
  const initials = userInitials(displayName, null)

  return (
    <div className="text-tour-text">
      <div className="mb-4 border-b border-black/10 pb-3 lg:hidden">
        <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
          Il Tour di Paolo
        </p>
        <p className="text-[15px] font-medium text-tour-text">{group?.name || 'Group'}</p>
      </div>

      {loadingGroup && <p className="text-sm text-tour-text-secondary">Loading…</p>}

      {!loadingGroup && !group && (
        <p className="text-sm text-tour-text-secondary">Group not found.</p>
      )}

      {!loadingGroup && group && !isMember && (
        <p className="text-sm text-tour-text-secondary">You are not a member of this group.</p>
      )}

      {!loadingGroup && group && isMember && !subjectInGroup && (
        <p className="text-sm text-tour-text-secondary">That member is not in this group.</p>
      )}

      {listError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {listError}
        </div>
      )}

      {!loadingGroup && isMember && subjectInGroup && !subjectMember && !listError && (
        <p className="text-sm text-tour-text-secondary">Member profile not found.</p>
      )}

      {!loadingGroup && isMember && subjectInGroup && subjectMember && (
        <>
          <section className="mb-4 flex items-start gap-3 rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#B5D4F4] text-[14px] font-medium text-[#0C447C]"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[16px] font-medium text-tour-text">
                {displayName || 'Member'}
              </h1>
              {user?.uid === userId && (
                <p className="mt-0.5 text-[11px] text-tour-text-secondary">You</p>
              )}
            </div>
          </section>

          <section className="mb-4 rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3">
            <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
              Medals
            </h2>
            {total === 0 ? (
              <p className="mt-2 text-sm text-tour-text-secondary">No activities in this group yet.</p>
            ) : (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="inline-flex items-center gap-1.5">
                    <MedalBadge tier="gold" size="sm" className={PROFILE_SUMMARY_BADGE_W} />
                    <span className="text-[12px] tabular-nums text-tour-text">
                      {counts.gold}/{total}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MedalBadge tier="silver" size="sm" className={PROFILE_SUMMARY_BADGE_W} />
                    <span className="text-[12px] tabular-nums text-tour-text">
                      {counts.silver}/{total}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <MedalBadge tier="bronze" size="sm" className={PROFILE_SUMMARY_BADGE_W} />
                    <span className="text-[12px] tabular-nums text-tour-text">
                      {counts.bronze}/{total}
                    </span>
                  </span>
                </div>
              </>
            )}
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3">
            <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
              By activity
            </h2>
            {activities.length === 0 ? (
              <p className="mt-2 text-sm text-tour-text-secondary">No activities yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-black/10">
                {activities.map((activity) => {
                  const progress = subjectMember?.progress?.[activity.id]
                  const tasksDone = progress?.tasksCompleted ?? 0
                  const tier = medalTierFromTasksCompleted(tasksDone)
                  return (
                    <li
                      key={activity.id}
                      className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_140px_7.25rem] sm:items-center sm:gap-x-4 sm:gap-y-0"
                    >
                      <div className="min-w-0 sm:col-start-1 sm:row-start-1">
                        <p className="text-[13px] font-medium text-tour-text">{activity.name}</p>
                        <p className="mt-0.5 text-[12px] text-tour-text-secondary">
                          {tasksDone} of 3 tasks
                        </p>
                      </div>
                      <div className="flex items-center gap-3 sm:contents">
                        <div className="min-w-0 flex-1 sm:col-start-2 sm:row-start-1 sm:w-[140px] sm:flex-none sm:shrink-0">
                          <ActivityProgressBar tasksCompleted={tasksDone} />
                        </div>
                        <div className="flex shrink-0 justify-end sm:col-start-3 sm:row-start-1 sm:justify-self-end">
                          <MedalBadge tier={tier} className={PROFILE_ACTIVITY_BADGE_W} />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
