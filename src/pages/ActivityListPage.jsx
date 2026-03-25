import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { getGroup } from '../services/groupService'
import { subscribeActivities, subscribeGroupMember } from '../services/activityService'
import { subscribePendingSubmission } from '../services/pendingService'
import { getTaskStatus } from '../lib/taskStatus'
import { medalTierFromTasksCompleted } from '../lib/medalTier'
import { MedalBadge } from '../components/MedalBadge'

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

  const submitted = Boolean(location.state?.submitted)

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
    if (!groupId || !isMember) return
    const unsub = subscribeActivities(
      groupId,
      (list) => setActivities(list),
      (e) => setError(e.message || 'Activities listener failed.'),
    )
    return () => unsub()
  }, [groupId, isMember])

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
      <div className="mb-4 border-b border-black/10 pb-3 lg:hidden">
        <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
          Il Tour di Paolo 2026
        </p>
        <p className="text-[15px] font-medium text-tour-text">{group?.name || 'Group'}</p>
      </div>

      {loadingGroup && <p className="text-sm text-tour-text-secondary">Loading group…</p>}

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
        <div className="mb-4 rounded-lg border border-tour-accent/30 bg-tour-accent-muted px-3 py-2 text-sm text-[#0F6E56]">
          Submission sent. Your submission will appear in the feed once the owner approves it.
        </div>
      )}

      {!loadingGroup && !error && isMember && (
        <>
          {activities.length === 0 && (
            <p className="rounded-xl border border-black/10 bg-tour-surface p-4 text-sm text-tour-text-secondary">
              No activities yet. The owner can add them from group settings (Phase 8).
            </p>
          )}

          <div className="flex flex-col gap-2">
            {activities.map((activity) => {
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
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <h2 className="text-[14px] font-medium text-tour-text">{activity.name}</h2>
                    <MedalBadge tier={tier} />
                  </div>
                  {activity.description && (
                    <p className="mb-2 text-[12px] text-tour-text-secondary">{activity.description}</p>
                  )}
                  {showAwaitingHint && (
                    <p className="mb-2 text-[11px] text-amber-900">Awaiting approval before next task</p>
                  )}
                  <ul className="divide-y divide-black/10">
                    {tasks.map((task) => {
                      const status = getTaskStatus(task, progress, pendingDoc)
                      const completePath = `/group/${groupId}/activity/${activity.id}/task/${task.id}`

                      return (
                        <li key={task.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                          <TaskStatusDot status={status} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] text-tour-text">{task.name}</p>
                            {status === 'pending' && (
                              <p className="mt-0.5 text-[11px] text-tour-text-secondary">Pending</p>
                            )}
                          </div>
                          {status === 'empty' && (
                            <Link
                              to={completePath}
                              className="shrink-0 rounded-full border border-tour-accent px-2.5 py-1 text-[11px] font-medium text-[#0F6E56]"
                            >
                              Complete
                            </Link>
                          )}
                          {status === 'blocked' && (
                            <button
                              type="button"
                              disabled
                              className="shrink-0 cursor-not-allowed rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-tour-text-secondary opacity-60"
                            >
                              Complete
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
