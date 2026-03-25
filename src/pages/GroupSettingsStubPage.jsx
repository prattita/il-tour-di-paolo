import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { subscribePendingCount } from '../services/approvalService'
import { getGroup } from '../services/groupService'

export function GroupSettingsStubPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [countError, setCountError] = useState('')

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
    setCountError('')
    const unsub = subscribePendingCount(
      groupId,
      (n) => setPendingCount(n),
      (e) => setCountError(e.message || 'Could not load pending count.'),
    )
    return () => unsub()
  }, [groupId, isOwner])

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

      {!loadingGroup && isOwner && (
        <div className="space-y-4">
          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[14px] font-medium text-tour-text">Pending approvals</h2>
            {countError && (
              <p className="mt-2 text-[12px] text-red-700">{countError}</p>
            )}
            {!countError && (
              <p className="mt-2 text-[13px] text-tour-text-secondary">
                {pendingCount === 0
                  ? 'No submissions awaiting review.'
                  : `${pendingCount} submission${pendingCount === 1 ? '' : 's'} awaiting review.`}
              </p>
            )}
            <Link
              to={`/group/${groupId}/approvals`}
              className="mt-3 inline-block rounded-full border border-tour-accent px-4 py-2 text-[12px] font-medium text-[#0F6E56]"
            >
              Open approval queue
              {pendingCount > 0 ? (
                <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-tour-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              ) : null}
            </Link>
          </section>

          <section className="rounded-xl border border-dashed border-black/15 bg-tour-muted/40 p-4 text-sm text-tour-text-secondary">
            <p className="font-medium text-tour-text">More settings</p>
            <p className="mt-2 leading-relaxed">
              Edit group, regenerate invite, manage members, and add or edit activities ship in{' '}
              <span className="font-medium text-tour-text">Phase 8</span>.
            </p>
          </section>
        </div>
      )}
    </div>
  )
}
