import { useEffect, useMemo, useState, useCallback } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { getGroup } from '../services/groupService'
import { ActivityListTaskRow } from '../components/ActivityListTaskRow'
import {
  adjustMemberCompoundCount,
  joinAdvancedActivity,
  subscribeEligibleAdvancedActivities,
  subscribeEnrollmentActivityIds,
  subscribeGroupMember,
  subscribeMemberVisibleActivities,
} from '../services/activityService'
import { subscribePendingSubmission, withdrawPendingSubmission } from '../services/pendingService'
import { medalTierFromTasksCompleted } from '../lib/medalTier'
import { MedalBadge } from '../components/MedalBadge'
import { PageLoading } from '../components/PageLoading'

import { getTaskStatus } from '../lib/taskStatus'

export function ActivityListPage() {
  const { t } = useTranslation()
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
  const [compoundBusyKey, setCompoundBusyKey] = useState(null)
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

  const handleCompoundDelta = useCallback(
    async (activityId, taskId, delta) => {
      if (!groupId || !user?.uid) return
      const key = `${activityId}-${taskId}`
      setCompoundBusyKey(key)
      try {
        await adjustMemberCompoundCount(groupId, user.uid, activityId, taskId, delta)
      } catch (e) {
        window.alert(e.message || t('activities.compoundUpdateFailed'))
      } finally {
        setCompoundBusyKey(null)
      }
    },
    [groupId, user?.uid, t],
  )

  const handleWithdrawSubmission = useCallback(
    async (activityId, pendingDoc) => {
      if (!groupId || !user?.uid || !pendingDoc?.id) return
      if (!window.confirm(t('activities.withdrawConfirm'))) {
        return
      }
      setWithdrawBusyActivityId(activityId)
      try {
        await withdrawPendingSubmission(groupId, user.uid, pendingDoc.id, pendingDoc)
      } catch (e) {
        window.alert(e.message || t('activities.withdrawFailed'))
      } finally {
        setWithdrawBusyActivityId(null)
      }
    },
    [groupId, user?.uid, t],
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
        if (active) setError(e.message || t('activities.loadGroupFailed'))
      } finally {
        if (active) setLoadingGroup(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [groupId, t])

  const isMember = Boolean(user?.uid && group?.memberIds?.includes(user.uid))

  useEffect(() => {
    if (!groupId || !isMember || !user?.uid) return
    const unsub = subscribeMemberVisibleActivities(
      groupId,
      user.uid,
      (list) => setActivities(list),
      (e) => setError(e.message || t('activities.loadActivitiesFailed')),
    )
    return () => unsub()
  }, [groupId, isMember, user?.uid, t])

  useEffect(() => {
    if (!groupId || !isMember || !user?.uid) return
    return subscribeEligibleAdvancedActivities(
      groupId,
      user.uid,
      setEligibleAdvancedActivities,
      (e) => setError(e.message || t('activities.loadAdvancedFailed')),
    )
  }, [groupId, isMember, user?.uid, t])

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
      return { id, name: act.name || t('activities.newActivityFallback') }
    }
    return null
  }, [enrolledIds, activities, groupId, unlockTick, t])

  useEffect(() => {
    if (!groupId || !user?.uid || !isMember) return
    const unsub = subscribeGroupMember(
      groupId,
      user.uid,
      (m) => setMember(m),
      (e) => setError(e.message || t('activities.loadMemberFailed')),
    )
    return () => unsub()
  }, [groupId, user?.uid, isMember, t])

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
    () => Object.fromEntries(activities.map((a) => [a.id, a.name || t('feed.activityFallback')])),
    [activities, t],
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
          {t('common.brandLine')}
        </p>
        <p className="text-[15px] font-medium leading-snug text-tour-text">
          {group?.name || t('groupShell.titleGroup')}
        </p>
      </div>

      {loadingGroup && <PageLoading label={t('activities.loadingGroup')} />}

      {!loadingGroup && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {!loadingGroup && !error && !group && (
        <p className="text-sm text-tour-text-secondary">{t('feed.groupNotFound')}</p>
      )}

      {!loadingGroup && !error && group && !isMember && (
        <p className="text-sm text-tour-text-secondary">{t('feed.notMember')}</p>
      )}

      {submitted && isMember && (
        <div className="mb-4 rounded-lg border border-tour-accent/30 bg-tour-accent-muted px-3 py-2 text-sm text-tour-accent-foreground">
          {t('activities.submissionSentBanner')}
        </div>
      )}

      {isMember && rejectionBanner && !bannerDismissed && (
        <div
          className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p>
            {t('activities.rejectionBefore')}{' '}
            <span className="font-medium">
              {rejectionBanner.taskName || t('activities.thisTaskFallback')}
            </span>{' '}
            {t('activities.rejectionAfter')}
          </p>
          <button
            type="button"
            onClick={dismissRejectionBanner}
            className="shrink-0 rounded-full border border-amber-300/80 px-3 py-1 text-[12px] font-medium text-amber-950 hover:bg-amber-100/80"
          >
            {t('activities.dismiss')}
          </button>
        </div>
      )}

      {isMember && advancedUnlockNotice && (
        <div
          className="mb-4 flex flex-col gap-2 rounded-lg border border-violet-200 bg-violet-50/90 px-3 py-2.5 text-sm text-tour-text sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p>
            <span aria-hidden>🔓</span> {t('activities.advancedUnlockBefore')}{' '}
            <span className="font-medium">{advancedUnlockNotice.name}</span>
            {t('activities.advancedUnlockAfter')}
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
              setUnlockTick((n) => n + 1)
            }}
            className="shrink-0 rounded-full border border-violet-300/80 px-3 py-1 text-[12px] font-medium text-tour-text hover:bg-violet-100/80"
          >
            {t('activities.gotIt')}
          </button>
        </div>
      )}

      {!loadingGroup && !error && isMember && (
        <>
          {eligibleAdvancedActivities.length > 0 && (
            <section className="mb-3 rounded-xl border border-violet-200 bg-violet-50/70 px-3.5 py-3">
              <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
                {t('activities.advancedJoinSectionTitle')}
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
                        {t('activities.advancedJoinHint')}
                      </p>
                      {activity.prerequisiteActivityId ? (
                        <p className="mt-0.5 text-[11px] text-violet-800/85">
                          {t('activities.advancedTrackOf', {
                            name:
                              activityNameById[activity.prerequisiteActivityId] ||
                              t('activities.prerequisiteFallback'),
                          })}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={joinBusyActivityId === activity.id}
                      onClick={async () => {
                        if (!groupId || !user?.uid || joinBusyActivityId) return
                        if (!window.confirm(t('activities.joinConfirm', { name: activity.name }))) {
                          return
                        }
                        setJoinBusyActivityId(activity.id)
                        try {
                          await joinAdvancedActivity(groupId, user.uid, activity.id)
                        } catch (e) {
                          window.alert(e.message || t('activities.joinFailed'))
                        } finally {
                          setJoinBusyActivityId(null)
                        }
                      }}
                      className="shrink-0 rounded-full border border-violet-300 bg-tour-surface px-3 py-1.5 text-[12px] font-medium text-tour-text hover:bg-violet-100/80 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {joinBusyActivityId === activity.id
                        ? t('activities.joining')
                        : t('activities.joinActivity')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {activities.length === 0 && (
            <p className="rounded-xl border border-black/10 bg-tour-surface p-4 text-sm text-tour-text-secondary">
              {t('activities.emptyList')}
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
                tasks.some((tk) => getTaskStatus(tk, progress, pendingDoc) === 'blocked')

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
                    <p className="mb-2 text-[11px] text-amber-900">
                      {t('activities.awaitingApprovalHint')}
                    </p>
                  )}
                  {pendingDoc && (
                    <div className="mb-2 rounded-lg border border-black/10 bg-tour-muted/40 px-2.5 py-2">
                      <p className="text-[11px] text-tour-text-secondary">
                        {t('activities.waitingReviewBefore')}{' '}
                        <span className="font-medium text-tour-text">
                          {pendingDoc.taskName || t('activities.thisTaskFallback')}
                        </span>
                        .
                      </p>
                      <button
                        type="button"
                        disabled={withdrawBusyActivityId === activity.id}
                        onClick={() => handleWithdrawSubmission(activity.id, pendingDoc)}
                        className="mt-2 rounded-lg border border-red-200/90 bg-tour-surface px-2.5 py-1.5 text-[11px] font-medium text-red-900 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {withdrawBusyActivityId === activity.id
                          ? t('activities.withdrawing')
                          : t('activities.withdrawSubmission')}
                      </button>
                    </div>
                  )}
                  <ul className="divide-y divide-black/10">
                    {tasks.map((task) => (
                      <ActivityListTaskRow
                        key={task.id}
                        task={task}
                        groupId={groupId}
                        activityId={activity.id}
                        progress={progress}
                        pendingDoc={pendingDoc}
                        member={member}
                        t={t}
                        onCompoundDelta={handleCompoundDelta}
                        compoundBusy={compoundBusyKey === `${activity.id}-${task.id}`}
                      />
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
          {enrolledAdvancedActivities.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
                {t('activities.advancedSectionTitle')}
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
                    tasks.some((tk) => getTaskStatus(tk, progress, pendingDoc) === 'blocked')

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
                            {t('activities.advancedBadge')}
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
                          {t('activities.advancedTrackOf', {
                            name:
                              activityNameById[activity.prerequisiteActivityId] ||
                              t('activities.prerequisiteFallback'),
                          })}
                        </p>
                      ) : null}
                      {showAwaitingHint && (
                        <p className="mb-2 text-[11px] text-amber-900">
                          {t('activities.awaitingApprovalHint')}
                        </p>
                      )}
                      {pendingDoc && (
                        <div className="mb-2 rounded-lg border border-black/10 bg-tour-muted/40 px-2.5 py-2">
                          <p className="text-[11px] text-tour-text-secondary">
                            {t('activities.waitingReviewBefore')}{' '}
                            <span className="font-medium text-tour-text">
                              {pendingDoc.taskName || t('activities.thisTaskFallback')}
                            </span>
                            .
                          </p>
                          <button
                            type="button"
                            disabled={withdrawBusyActivityId === activity.id}
                            onClick={() => handleWithdrawSubmission(activity.id, pendingDoc)}
                            className="mt-2 rounded-lg border border-red-200/90 bg-tour-surface px-2.5 py-1.5 text-[11px] font-medium text-red-900 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {withdrawBusyActivityId === activity.id
                              ? t('activities.withdrawing')
                              : t('activities.withdrawSubmission')}
                          </button>
                        </div>
                      )}
                      <ul className="divide-y divide-black/10">
                        {tasks.map((task) => (
                          <ActivityListTaskRow
                            key={task.id}
                            task={task}
                            groupId={groupId}
                            activityId={activity.id}
                            progress={progress}
                            pendingDoc={pendingDoc}
                            member={member}
                            t={t}
                            onCompoundDelta={handleCompoundDelta}
                            compoundBusy={compoundBusyKey === `${activity.id}-${task.id}`}
                          />
                        ))}
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
