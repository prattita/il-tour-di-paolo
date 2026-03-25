import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import {
  approvePendingSubmission,
  rejectPendingSubmission,
  subscribePendingQueue,
} from '../services/approvalService'
import { getGroup } from '../services/groupService'

function formatSubmittedAt(value) {
  if (!value) return '—'
  const d = typeof value.toDate === 'function' ? value.toDate() : value
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function GroupApprovalsPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [queue, setQueue] = useState([])
  const [queueError, setQueueError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState(null)

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

  const isOwner = Boolean(user?.uid && group?.ownerId === user.uid)
  const isMember = Boolean(user?.uid && group?.memberIds?.includes(user.uid))

  useEffect(() => {
    if (!groupId || !isOwner) return
    setQueueError('')
    const unsub = subscribePendingQueue(
      groupId,
      (items) => setQueue(items),
      (e) => setQueueError(e.message || 'Failed to load approvals.'),
    )
    return () => unsub()
  }, [groupId, isOwner])

  const APPROVAL_DEADLINE_MS = 120_000

  async function handleApprove(pending) {
    if (!groupId || busyId) return
    setActionError('')
    setBusyId(pending.id)
    let deadlineId
    const deadline = new Promise((_, reject) => {
      deadlineId = setTimeout(() => {
        reject(
          new Error(
            'Approval took too long and was stopped. If the post appears in the feed, refresh; otherwise try again or check the browser console.',
          ),
        )
      }, APPROVAL_DEADLINE_MS)
    })
    try {
      await Promise.race([approvePendingSubmission(groupId, pending.id, pending), deadline])
    } catch (e) {
      setActionError(e?.message || e?.code || 'Approve failed.')
      console.error('[approve]', e)
    } finally {
      clearTimeout(deadlineId)
      setBusyId(null)
    }
  }

  async function handleReject(pending) {
    if (!groupId || busyId) return
    if (!window.confirm(`Reject submission from ${pending.displayName || 'member'} for “${pending.taskName}”?`)) {
      return
    }
    setActionError('')
    setBusyId(pending.id)
    try {
      await rejectPendingSubmission(groupId, pending.id, pending)
    } catch (e) {
      setActionError(e.message || 'Reject failed.')
    } finally {
      setBusyId(null)
    }
  }

  if (!loadingGroup && !group) {
    return <p className="text-sm text-tour-text-secondary">Group not found.</p>
  }

  if (!loadingGroup && group && !isMember) {
    return <p className="text-sm text-tour-text-secondary">You are not a member of this group.</p>
  }

  if (!loadingGroup && group && isMember && !isOwner) {
    return <Navigate to={`/group/${groupId}/feed`} replace />
  }

  return (
    <div className="text-tour-text">
      <div className="mb-4 border-b border-black/10 pb-3 lg:hidden">
        <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
          Il Tour di Paolo 2026
        </p>
        <p className="text-[15px] font-medium text-tour-text">{group?.name || 'Group'}</p>
      </div>

      {loadingGroup && <p className="text-sm text-tour-text-secondary">Loading…</p>}

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </div>
      )}

      {queueError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {queueError}
        </div>
      )}

      {!loadingGroup && isOwner && queue.length === 0 && !queueError && (
        <p className="rounded-xl border border-black/10 bg-tour-surface p-4 text-sm text-tour-text-secondary">
          No submissions awaiting review.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {queue.map((pending) => (
          <article
            key={pending.id}
            className="overflow-hidden rounded-xl border border-black/10 bg-tour-surface"
          >
            {pending.imageUrl && (
              <img
                src={pending.imageUrl}
                alt=""
                className="aspect-[4/3] w-full object-cover"
              />
            )}
            <div className="space-y-2 px-3.5 py-3">
              <div className="text-[13px]">
                <p className="font-medium text-tour-text">{pending.displayName || 'Member'}</p>
                <p className="mt-0.5 text-tour-text-secondary">
                  <span className="text-tour-text">{pending.activityName}</span>
                  {' · '}
                  <span className="text-tour-text">{pending.taskName}</span>
                </p>
                <p className="mt-1 text-[11px] text-tour-text-secondary">
                  Submitted {formatSubmittedAt(pending.submittedAt)}
                </p>
              </div>
              {pending.description && (
                <p className="text-[12px] text-tour-text-secondary">{pending.description}</p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busyId === pending.id}
                  onClick={() => handleApprove(pending)}
                  className="rounded-full bg-tour-accent px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50"
                >
                  {busyId === pending.id ? 'Working…' : 'Approve'}
                </button>
                <button
                  type="button"
                  disabled={busyId === pending.id}
                  onClick={() => handleReject(pending)}
                  className="rounded-full border border-black/15 px-4 py-2 text-[12px] font-medium text-tour-text disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
