import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { getGroup } from '../services/groupService'
import {
  joinAdvancedActivity,
  subscribeEligibleAdvancedActivities,
  subscribeEnrollmentActivityIds,
  subscribeGroupMember,
  subscribeMemberVisibleActivities,
} from '../services/activityService'
import { subscribePendingSubmission, withdrawPendingSubmission } from '../services/pendingService'
import { getTaskStatus } from '../lib/taskStatus'
import { medalTierFromTasksCompleted } from '../lib/medalTier'
import { MedalBadge } from '../components/MedalBadge'
import { PageLoading } from '../components/PageLoading'

function TaskStatusDot({ status }) {
  if (status === 'approved') {
    return (
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#C0DD97] text-[10px] text-[#173404]"
        aria-hidden
      >
        ✓
      </div>
    )
  }
  if (status === 'pending') {
    return (
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FAEEDA] text-[10px] text-[#633806]"
        aria-hidden
      >
        ⏳
      </div>
    )
  }
  return (
    <div
      className="h-5 w-5 shrink-0 rounded-full border border-black/18 bg-tour-muted"
      aria-hidden
    />
  )
}

export function ActivityListPage() {
  const { groupId } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [activities, setActivities] = useState([])
  const [member, setMember] = useState(null)
  const [pendingByActivityId, setPendingByActivityId] = useState({})
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [error, setError] = useState('')
  const [withdrawBusyActivityId, setWithdrawBusyActivityId] = useState(null)
  const [joinBusyActivityId, setJoinBusyActivityId] = useState(null)
  const [eligibleAdvancedActivities, setEligibleAdvancedActivities] = useState([])
  const [enrolledIds, setEnrolledIds] = useState([])
  const [unlockTick, setUnlockTick] = useState(0)

  const submitted = Boolean(location.state?.submitted)

  const rejectionBanner = member?.rejectionBanner
  const dismissStorageKey = useMemo(() => {
    if (!groupId || !rejectionBanner?.activityId || !rejectionBanner?.taskId) return null
    return `rej-dismiss-${groupId}-${rejectionBanner.activityId}-${rejectionBanner.taskId}`
  }, [groupId, rejectionBanner?.activityId, rejectionBanner?.taskId])

  const [bannerDismissed, setBannerDismissed] = useState(true)

  useEffect(() => {
    if (!dismissStorageKey) {
      setBannerDismissed(true)
      return
    }
    setBannerDismissed(localStorage.getItem(dismissStorageKey) === '1')
  }, [dismissStorageKey])

  const dismissRejectionBanner = useCallback(() => {
    if (dismissStorageKey) {
      localStorage.setItem(dismissStorageKey, '1')
    }
    setBannerDismissed(true)
  }, [dismissStorageKey])

  const handleWithdrawSubmission = useCallback(
    async (activityId, pendingDoc) => {
      if (!groupId || !user?.uid || !pendingDoc?.id) return
      if (
        !window.confirm(
          'Withdraw this submission? Your photo will be removed and you can submit a task again when you are ready.',
        )
      ) {
        return
      }
      setWithdrawBusyActivityId(activityId)
      try {
        await withdrawPendingSubmission(groupId, user.uid, pendingDoc.id, pendingDoc)
      } catch (e) {
        window.alert(e.message || 'Could not withdraw submission.')
      } finally {
        setWithdrawBusyActivityId(null)
      }
    },
    [groupId, user?.uid],
  )

  useEffect(() => {
    let active = true
    async function run() {
      if (!groupId) return
      setLoadingGroup(true)
      setError('')
      try {
        const g = await getGroup(groupId)
        if (active) setGroup(g)
      } catch (e) {
        if (active) setError(e.message || 'Failed to load group.')
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

  useEffect(() => {
    if (!groupId || !isMember || !user?.uid) return
    const unsub = subscribeMemberVisibleActivities(
      groupId,
      user.uid,
      (list) => setActivities(list),
      (e) => setError(e.message || 'Activities listener failed.'),
    )
    return () => unsub()
  }, [groupId, isMember, user?.uid])

  useEffect(() => {
    if (!groupId || !isMember || !user?.uid) return
    return subscribeEligibleAdvancedActivities(
      groupId,
      user.uid,
      setEligibleAdvancedActivities,
      (e) => setError(e.message || 'Advanced activity listener failed.'),
    )
  }, [groupId, isMember, user?.uid])

  useEffect(() => {
    if (!groupId || !isMember || !user?.uid) return
    return subscribeEnrollmentActivityIds(groupId, user.uid, setEnrolledIds, () => {})
  }, [groupId, isMember, user?.uid])

  const advancedUnlockNotice = useMemo(() => {
    void unlockTick
    if (!groupId) return null
    for (const id of enrolledIds) {
      const act = activities.find((a) => a.id === id)
      if (!act || act.isAdvanced !== true) continue
      if (localStorage.getItem(`adv-unlock-seen-${groupId}-${id}`) === '1') continue
      return { id, name: act.name || 'New activity' }
    }
    return null
  }, [enrolledIds, activities, groupId, unlockTick])

  useEffect(() => {
    if (!groupId || !user?.uid || !isMember) return
    const unsub = subscribeGroupMember(
      groupId,
      user.uid,
      (m) => setMember(m),
      (e) => setError(e.message || 'Member listener failed.'),
    )
    return () => unsub()
  }, [groupId, user?.uid, isMember])

  const activityIdsKey = useMemo(() => activities.map((a) => a.id).sort().join(','), [activities])
  const standardActivities = useMemo(
    () => activities.filter((a) => a?.isAdvanced !== true),
    [activities],
  )
  const enrolledAdvancedActivities = useMemo(
    () => activities.filter((a) => a?.isAdvanced === true),
    [activities],
  )
  const activityNameById = useMemo(
    () => Object.fromEntries(activities.map((a) => [a.id, a.name || 'Activity'])),
    [activities],
  )

  useEffect(() => {
    if (!groupId || !user?.uid || !activityIdsKey) {
      return
    }
    const ids = activities.map((a) => a.id)
    const unsubs = ids.map((activityId) =>
      subscribePendingSubmission(
        groupId,
        user.uid,
        activityId,
        (data) =>
          setPendingByActivityId((prev) => ({
            ...prev,
            [activityId]: data,
          })),
        () => {},
      ),
    )
    return () => unsubs.forEach((u) => u())
  }, [groupId, user?.uid, activityIdsKey, activities])

  return (
    <div className="text-tour-text">
      <div className="mb-3 border-b border-black/10 pb-2 lg:hidden">
        <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
          Il Tour di Paolo
        </p>
        <p className="text-[15px] font-medium leading-snug text-tour-text">{group?.name || 'Group'}</p>
      </div>

      {loadingGroup && <PageLoading label="Loading group…" />}

      {!loadingGroup && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {!loadingGroup && !error && !group && (
        <p className="text-sm text-tour-text-secondary">Group not found.</p>
      )}

      {!loadingGroup && !error && group && !isMember && (
        <p className="text-sm text-tour-text-secondary">You are not a member of this group.</p>
      )}

      {submitted && isMember && (
        <div className="mb-4 rounded-lg border border-tour-accent/30 bg-tour-accent-muted px-3 py-2 text-sm text-tour-accent-foreground">
          Submission sent. Your submission will appear in the feed once the owner approves it.
        </div>
      )}

      {isMember && rejectionBanner && !bannerDismissed && (
        <div
          className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p>
            Your submission for{' '}
            <span className="font-medium">{rejectionBanner.taskName || 'this task'}</span> was not
            approved. Please resubmit.
          </p>
          <button
            type="button"
            onClick={dismissRejectionBanner}
            className="shrink-0 rounded-full border border-amber-300/80 px-3 py-1 text-[12px] font-medium text-amber-950 hover:bg-amber-100/80"
          >
            Dismiss
          </button>
        </div>
      )}

      {isMember && advancedUnlockNotice && (
        <div
          className="mb-4 flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50/90 px-3 py-2.5 text-sm text-tour-text sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p>
            <span aria-hidden>🔓</span> You unlocked a new activity:{' '}
            <span className="font-medium">{advancedUnlockNotice.name}</span>. You can now join it
            from this page.
          </p>
          <button
            type="button"
            onClick={() => {
              if (groupId && advancedUnlockNotice) {
                localStorage.setItem(
                  `adv-unlock-seen-${groupId}-${advancedUnlockNotice.id}`,
                  '1',
                )
              }
              setUnlockTick((t) => t + 1)
            }}
            className="shrink-0 rounded-full border border-violet-300/80 px-3 py-1 text-[12px] font-medium text-tour-text hover:bg-violet-100/80"
          >
            Got it
          </button>
        </div>
      )}

      {!loadingGroup && !error && isMember && (
        <>
          {eligibleAdvancedActivities.length > 0 && (
            <section className="mb-3 rounded-xl border border-violet-200 bg-violet-50/70 px-3.5 py-3">
              <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
                Advanced activities you can join
              </h2>
              <ul className="mt-2 space-y-2">
                {eligibleAdvancedActivities.map((activity) => (
                  <li
                    key={activity.id}
                    className="flex flex-col gap-2 rounded-lg border border-violet-200/80 bg-tour-surface px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-tour-text">{activity.name}</p>
                      <p className="mt-0.5 text-[11px] text-tour-text-secondary">
                        Optional. Once joined, you cannot unenroll.
                      </p>
                      {activity.prerequisiteActivityId ? (
                        <p className="mt-0.5 text-[11px] text-violet-800/85">
                          Advanced track of:{' '}
                          {activityNameById[activity.prerequisiteActivityId] || 'prerequisite activity'}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={joinBusyActivityId === activity.id}
                      onClick={async () => {
                        if (!groupId || !user?.uid || joinBusyActivityId) return
                        if (
                          !window.confirm(
                            `Join "${activity.name}"? Once joined, you cannot unenroll.`,
                          )
                        ) {
                          return
                        }
                        setJoinBusyActivityId(activity.id)
                        try {
                          await joinAdvancedActivity(groupId, user.uid, activity.id)
                        } catch (e) {
                          window.alert(e.message || 'Could not join this advanced activity.')
                        } finally {
                          setJoinBusyActivityId(null)
                        }
                      }}
                      className="shrink-0 rounded-full border border-violet-300 bg-tour-surface px-3 py-1.5 text-[12px] font-medium text-tour-text hover:bg-violet-100/80 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {joinBusyActivityId === activity.id ? 'Joining…' : 'Join activity'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {activities.length === 0 && (
            <p className="rounded-xl border border-black/10 bg-tour-surface p-4 text-sm text-tour-text-secondary">
              No activities yet. The owner can add them in Group settings.
            </p>
          )}

          <div className="flex flex-col gap-3">
            {standardActivities.map((activity) => {
              const progress = member?.progress?.[activity.id]
              const pendingDoc = pendingByActivityId[activity.id]
              const tasks = activity.tasks || []
              const tasksDone = progress?.tasksCompleted ?? 0
              const tier = medalTierFromTasksCompleted(tasksDone)
              const showAwaitingHint =
                Boolean(pendingDoc) &&
                tasks.some((t) => getTaskStatus(t, progress, pendingDoc) === 'blocked')

              return (
                <section
                  key={activity.id}
                  className="rounded-xl border border-black/10 bg-tour-surface px-3.5 py-3"
                >
                  <div
                    className={[
                      'flex items-center justify-between gap-3',
                      activity.description ? 'mb-1' : 'mb-2',
                    ].join(' ')}
                  >
                    <h2 className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-tour-text">
                      {activity.name}
                    </h2>
                    <MedalBadge tier={tier} className="w-[4.75rem] shrink-0" />
                  </div>
                  {activity.description && (
                    <p className="mb-4 text-[12px] leading-snug text-tour-text-secondary">
                      {activity.description}
                    </p>
                  )}
                  {showAwaitingHint && (
                    <p className="mb-2 text-[11px] text-amber-900">Awaiting approval before next task</p>
                  )}
                  {pendingDoc && (
                    <div className="mb-2 rounded-lg border border-black/10 bg-tour-muted/40 px-2.5 py-2">
                      <p className="text-[11px] text-tour-text-secondary">
                        Waiting for the owner to review your submission for{' '}
                        <span className="font-medium text-tour-text">{pendingDoc.taskName || 'this task'}</span>.
                      </p>
                      <button
                        type="button"
                        disabled={withdrawBusyActivityId === activity.id}
                        onClick={() => handleWithdrawSubmission(activity.id, pendingDoc)}
                        className="mt-2 rounded-lg border border-red-200/90 bg-tour-surface px-2.5 py-1.5 text-[11px] font-medium text-red-900 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {withdrawBusyActivityId === activity.id ? 'Withdrawing…' : 'Withdraw submission'}
                      </button>
                    </div>
                  )}
                  <ul className="divide-y divide-black/10">
                    {tasks.map((task) => {
                      const status = getTaskStatus(task, progress, pendingDoc)
                      const completePath = `/group/${groupId}/complete?${new URLSearchParams({
                        activityId: activity.id,
                        taskId: task.id,
                      }).toString()}`

                      const completePillClass =
                        'shrink-0 rounded-full border border-tour-accent px-2.5 py-1 text-[11px] font-medium text-tour-accent-foreground'

                      return (
                        <li key={task.id} className="min-w-0 first:pt-0 last:pb-0">
                          {status === 'empty' ? (
                            <Link
                              to={completePath}
                              className="-mx-2 flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left text-inherit no-underline hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent"
                            >
                              <TaskStatusDot status={status} />
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] text-tour-text">{task.name}</p>
                              </div>
                              <span className={completePillClass}>Complete</span>
                            </Link>
                          ) : (
                            <div className="flex items-center gap-2.5 py-2">
                              <TaskStatusDot status={status} />
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] text-tour-text">{task.name}</p>
                                {status === 'pending' && (
                                  <p className="mt-0.5 text-[11px] text-tour-text-secondary">Pending</p>
                                )}
                              </div>
                              {status === 'blocked' && (
                                <button
                                  type="button"
                                  disabled
                                  className="shrink-0 cursor-not-allowed rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-tour-text-secondary opacity-60"
                                >
                                  Complete
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
          {enrolledAdvancedActivities.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
                Advanced activities
              </h3>
              <div className="flex flex-col gap-3">
                {enrolledAdvancedActivities.map((activity) => {
                  const progress = member?.progress?.[activity.id]
                  const pendingDoc = pendingByActivityId[activity.id]
                  const tasks = activity.tasks || []
                  const tasksDone = progress?.tasksCompleted ?? 0
                  const tier = medalTierFromTasksCompleted(tasksDone)
                  const showAwaitingHint =
                    Boolean(pendingDoc) &&
                    tasks.some((t) => getTaskStatus(t, progress, pendingDoc) === 'blocked')

                  return (
                    <section
                      key={activity.id}
                      className="rounded-xl border border-violet-200 bg-violet-50/40 px-3.5 py-3"
                    >
                      <div
                        className={[
                          'flex items-center justify-between gap-3',
                          activity.description ? 'mb-1' : 'mb-2',
                        ].join(' ')}
                      >
                        <h2 className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-tour-text">
                          {activity.name}
                          <span className="ml-2 align-middle rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                            Advanced
                          </span>
                        </h2>
                        <MedalBadge tier={tier} className="w-[4.75rem] shrink-0" />
                      </div>
                      {activity.description && (
                        <p className="mb-4 text-[12px] leading-snug text-tour-text-secondary">
                          {activity.description}
                        </p>
                      )}
                      {activity.prerequisiteActivityId ? (
                        <p className="mb-2 text-[11px] text-violet-800/85">
                          Advanced track of:{' '}
                          {activityNameById[activity.prerequisiteActivityId] || 'prerequisite activity'}
                        </p>
                      ) : null}
                      {showAwaitingHint && (
                        <p className="mb-2 text-[11px] text-amber-900">
                          Awaiting approval before next task
                        </p>
                      )}
                      {pendingDoc && (
                        <div className="mb-2 rounded-lg border border-black/10 bg-tour-muted/40 px-2.5 py-2">
                          <p className="text-[11px] text-tour-text-secondary">
                            Waiting for the owner to review your submission for{' '}
                            <span className="font-medium text-tour-text">
                              {pendingDoc.taskName || 'this task'}
                            </span>
                            .
                          </p>
                          <button
                            type="button"
                            disabled={withdrawBusyActivityId === activity.id}
                            onClick={() => handleWithdrawSubmission(activity.id, pendingDoc)}
                            className="mt-2 rounded-lg border border-red-200/90 bg-tour-surface px-2.5 py-1.5 text-[11px] font-medium text-red-900 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {withdrawBusyActivityId === activity.id ? 'Withdrawing…' : 'Withdraw submission'}
                          </button>
                        </div>
                      )}
                      <ul className="divide-y divide-black/10">
                        {tasks.map((task) => {
                          const status = getTaskStatus(task, progress, pendingDoc)
                          const completePath = `/group/${groupId}/complete?${new URLSearchParams({
                            activityId: activity.id,
                            taskId: task.id,
                          }).toString()}`

                          const completePillClass =
                            'shrink-0 rounded-full border border-tour-accent px-2.5 py-1 text-[11px] font-medium text-tour-accent-foreground'

                          return (
                            <li key={task.id} className="min-w-0 first:pt-0 last:pb-0">
                              {status === 'empty' ? (
                                <Link
                                  to={completePath}
                                  className="-mx-2 flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left text-inherit no-underline hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent"
                                >
                                  <TaskStatusDot status={status} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[13px] text-tour-text">{task.name}</p>
                                  </div>
                                  <span className={completePillClass}>Complete</span>
                                </Link>
                              ) : (
                                <div className="flex items-center gap-2.5 py-2">
                                  <TaskStatusDot status={status} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[13px] text-tour-text">{task.name}</p>
                                    {status === 'pending' && (
                                      <p className="mt-0.5 text-[11px] text-tour-text-secondary">Pending</p>
                                    )}
                                  </div>
                                  {status === 'blocked' && (
                                    <button
                                      type="button"
                                      disabled
                                      className="shrink-0 cursor-not-allowed rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-tour-text-secondary opacity-60"
                                    >
                                      Complete
                                    </button>
                                  )}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
