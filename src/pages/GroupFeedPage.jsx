import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { getGroup } from '../services/groupService'

export function GroupFeedPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadGroup() {
      if (!groupId) return
      setLoading(true)
      setError('')
      try {
        const data = await getGroup(groupId)
        if (active) {
          setGroup(data)
        }
      } catch (e) {
        if (active) {
          setError(e.message || 'Failed to load group.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    loadGroup()
    return () => {
      active = false
    }
  }, [groupId])

  const isOwner = Boolean(user?.uid && group?.ownerId === user.uid)

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Group Feed</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-800">
              {group?.name || `Group ${groupId}`}
            </h1>
            {group?.description && <p className="mt-2 text-sm text-slate-600">{group.description}</p>}
          </div>
          <Link
            to="/"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Home
          </Link>
        </header>

        {loading && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Loading group details...
          </section>
        )}

        {!loading && error && (
          <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </section>
        )}

        {!loading && !error && !group && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Group not found.
          </section>
        )}

        {!loading && !error && group && (
          <section className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <p>
                Members: <span className="font-medium">{group.memberIds?.length || 0}</span>
              </p>
              <p className="mt-1">
                Activities: <span className="font-medium">{group.activityCount || 0}</span>
              </p>
              <p className="mt-1">
                Invite code: <span className="font-mono font-medium">{group.inviteCode}</span>
              </p>
              {isOwner && (
                <p className="mt-2 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  You are the owner of this group.
                </p>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Feed/activity/approvals UI lands in Phase 4-6. This page now confirms group routing and
              metadata.
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
