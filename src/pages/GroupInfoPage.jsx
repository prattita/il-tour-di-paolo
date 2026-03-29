import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { subscribeActivities, subscribeGroupMembers } from '../services/activityService'
import { getGroup } from '../services/groupService'

function userInitials(displayName) {
  const name = displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return '??'
}

export function GroupInfoPage() {
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
        if (active) setError(e.message || 'Failed to load group.')
      } finally {
        if (active) setLoading(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [groupId])

  const isMember = Boolean(user?.uid && group?.memberIds?.includes(user.uid))
  const isOwner = Boolean(user?.uid && group?.ownerId === user.uid)

  useEffect(() => {
    if (!groupId || !isMember) return
    const unsubM = subscribeGroupMembers(
      groupId,
      (list) => setMembers(list),
      () => setMembers([]),
    )
    const unsubA = subscribeActivities(
      groupId,
      (list) => setActivities(list),
      () => setActivities([]),
    )
    return () => {
      unsubM()
      unsubA()
    }
  }, [groupId, isMember])

  function toggleActivityExpanded(id) {
    setExpandedActivityIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
      <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
        <h1 className="text-lg font-medium text-tour-text">{group.name}</h1>
        {group.description ? (
          <p className="mt-2 text-sm leading-relaxed text-tour-text-secondary">{group.description}</p>
        ) : (
          <p className="mt-2 text-sm text-tour-text-secondary">No description yet.</p>
        )}
        {isOwner && (
          <Link
            to={`/group/${groupId}/settings`}
            className="mt-3 inline-flex rounded-lg border border-tour-accent/40 bg-tour-accent-muted/60 px-3 py-2 text-[12px] font-medium text-tour-accent-foreground hover:opacity-95"
          >
            Edit group & invite
          </Link>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-tour-surface p-4">
        <h2 className="text-[12px] font-medium uppercase tracking-wide text-tour-text-secondary">
          Members
        </h2>
        {members.length === 0 ? (
          <p className="mt-2 text-sm text-tour-text-secondary">No members loaded.</p>
        ) : (
          <ul className="mt-3 divide-y divide-black/10">
            {members.map((m) => {
              const initials = userInitials(m.displayName)
              const rowOwner = m.id === group.ownerId
              return (
                <li key={m.id} className="min-w-0 py-3 first:pt-0 last:pb-0">
                  <Link
                    to={`/group/${groupId}/profile/${m.id}`}
                    className="-mx-2 flex min-w-0 items-center gap-3 rounded-lg px-2 py-1 text-tour-text hover:bg-black/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#B5D4F4] text-[12px] font-medium text-[#0C447C]"
                      aria-hidden
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium">{m.displayName || 'Member'}</span>
                      {rowOwner && (
                        <span className="ml-2 rounded bg-tour-muted px-1.5 py-0.5 text-[10px] font-medium text-tour-text-secondary">
                          Owner
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
            Activities
          </h2>
          <Link
            to={`/group/${groupId}/activities`}
            className="text-[11px] font-medium text-tour-accent underline"
          >
            View all →
          </Link>
        </div>
        {activities.length === 0 ? (
          <p className="mt-2 text-sm text-tour-text-secondary">
            No activities yet.
            {isOwner ? ' Add them in Group settings.' : ' Ask the owner to add some.'}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {activities.map((a) => {
              const open = expandedActivityIds.has(a.id)
              return (
                <li key={a.id} className="overflow-hidden rounded-lg border border-black/10">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggleActivityExpanded(a.id)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-black/[0.03]"
                  >
                    <span className="min-w-0 flex-1 text-[13px] font-medium text-tour-text">{a.name}</span>
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
                        {(a.tasks || []).map((t) => (
                          <li key={t.id} className="flex gap-2 text-[12px] text-tour-text">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tour-accent" />
                            <span>{t.name}</span>
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
