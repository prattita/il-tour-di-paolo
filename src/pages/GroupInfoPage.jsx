import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { listActivities } from '../services/activityService'
import { getGroup } from '../services/groupService'

export function GroupInfoPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [activities, setActivities] = useState([])
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
        if (!active) return
        setGroup(g)
        if (g && user?.uid && g.memberIds?.includes(user.uid)) {
          try {
            const acts = await listActivities(groupId)
            if (active) setActivities(acts)
          } catch {
            if (active) setActivities([])
          }
        }
      } catch (e) {
        if (active) setError(e.message || 'Failed to load group.')
      } finally {
        if (active) setLoading(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [groupId, user?.uid])

  const isMember = Boolean(user?.uid && group?.memberIds?.includes(user.uid))
  const isOwner = Boolean(user?.uid && group?.ownerId === user.uid)

  if (loading) {
    return <p className="text-sm text-tour-text-secondary">Loading…</p>
  }
  if (error) {
    return <p className="text-sm text-red-800">{error}</p>
  }
  if (!group) {
    return <p className="text-sm text-tour-text-secondary">Group not found.</p>
  }
  if (!isMember) {
    return <p className="text-sm text-tour-text-secondary">You are not a member of this group.</p>
  }

  return (
    <div className="space-y-4 text-tour-text">
      {/* Everyone: name + description (mock 7a / 7b top card) */}
      <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
        <h1 className="text-lg font-medium text-tour-text">{group.name}</h1>
        {group.description ? (
          <p className="mt-2 text-sm leading-relaxed text-tour-text-secondary">{group.description}</p>
        ) : (
          <p className="mt-2 text-sm text-tour-text-secondary">No description yet.</p>
        )}
        {isOwner && (
          <p className="mt-3 inline-block rounded-md border border-black/10 bg-tour-muted px-2.5 py-1 text-xs font-medium text-tour-text-secondary">
            Edit group info — Phase 8
          </p>
        )}
      </section>

      {/* Owner only: invite + members (mock 7b) */}
      {isOwner && (
        <>
          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <p className="mb-2 text-[12px] text-tour-text-secondary">Invite code</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[15px] font-medium tracking-wide text-tour-text">
                {group.inviteCode}
              </span>
              <span className="rounded-md border border-black/10 bg-tour-muted px-2 py-1 text-xs text-tour-text-secondary">
                Regenerate — Phase 8
              </span>
            </div>
          </section>

          <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
            <h2 className="text-[13px] font-medium text-tour-text">Members</h2>
            <p className="mt-2 text-sm text-tour-text-secondary">
              <span className="font-medium text-tour-text">{group.memberIds?.length || 0}</span>{' '}
              {group.memberIds?.length === 1 ? 'member' : 'members'}
            </p>
            <p className="mt-2 text-xs text-tour-text-secondary">
              Roster, remove member, and avatars ship in Phase 8.
            </p>
          </section>
        </>
      )}

      {/* Activities overview — both roles; owner sees extra hint (mock 7b) */}
      <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
          Activities
        </h2>
        {activities.length === 0 ? (
          <p className="mt-2 text-sm text-tour-text-secondary">
            No activities yet.{' '}
            {isOwner ? 'Add them from Group Settings in Phase 8.' : 'Ask the owner to add some.'}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10">
            {activities.map((a) => (
              <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                <p className="text-[13px] font-medium text-tour-text">{a.name}</p>
                {a.description && (
                  <p className="mt-0.5 text-[12px] text-tour-text-secondary">{a.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-tour-text-secondary">
          Complete tasks and track progress in the{' '}
          <Link to={`/group/${groupId}/activities`} className="font-medium text-tour-accent underline">
            Activities
          </Link>{' '}
          tab.
        </p>
        {isOwner && (
          <p className="mt-2 text-[11px] text-tour-text-secondary">
            Add or edit activities from Group Settings (Phase 8). Per-activity join/leave for members is
            a fast-follow (see DESIGN.md).
          </p>
        )}
      </section>
    </div>
  )
}
