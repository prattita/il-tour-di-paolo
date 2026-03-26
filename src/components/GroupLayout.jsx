import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { signOutUser } from '../services/authService'
import { getGroup } from '../services/groupService'

function userInitials(user) {
  const name = user?.displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  const email = user?.email?.trim()
  if (email) return email.slice(0, 2).toUpperCase()
  return '??'
}

/** Same horizontal inset as brand header (`px-4`) so labels align with group title. */
function navLinkClass({ isActive }) {
  return [
    'block w-full rounded-lg py-2.5 text-left text-[13px] transition-colors',
    isActive
      ? 'bg-[#E6F1FB] font-medium text-[#185FA5]'
      : 'text-tour-text hover:bg-black/[0.04]',
  ].join(' ')
}

function ownerBadge() {
  return (
    <span className="shrink-0 rounded bg-tour-muted px-1.5 py-0.5 text-[10px] font-medium text-tour-text-secondary">
      Owner
    </span>
  )
}

function GroupNavPanel({ groupId, user, isOwner, onNavigate }) {
  const profilePath = `/group/${groupId}/profile/${user?.uid || ''}`

  const handleNav = () => {
    onNavigate?.()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <NavLink
        to={profilePath}
        onClick={handleNav}
        className={({ isActive }) =>
          [
            'block border-b border-black/10 px-4 pb-3 pt-2 outline-none transition-colors hover:bg-black/[0.03]',
            isActive ? 'bg-black/[0.04]' : '',
          ].join(' ')
        }
      >
        <div className="flex items-start gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B5D4F4] text-[12px] font-medium text-[#0C447C]"
            aria-hidden
          >
            {user ? userInitials(user) : '—'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight text-tour-text">
              {user?.displayName || user?.email || 'Member'}
            </p>
            <p className="text-[11px] text-tour-text-secondary">{isOwner ? 'Owner' : 'Member'}</p>
            <p className="mt-1.2 text-[11px] font-medium text-tour-accent">See profile</p>
          </div>
        </div>
      </NavLink>

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-4 py-2" onClick={handleNav}>
        <NavLink to={`/group/${groupId}/feed`} className={navLinkClass}>
          Feed
        </NavLink>
        <NavLink to={`/group/${groupId}/activities`} className={navLinkClass}>
          Activities
        </NavLink>
        <NavLink to={`/group/${groupId}/info`} className={navLinkClass}>
          Group Info
        </NavLink>
        {isOwner && (
          <>
            <div className="my-2 h-px bg-black/10" />
            <NavLink to={`/group/${groupId}/approvals`} className={navLinkClass}>
              <span className="flex w-full items-center justify-between gap-2">
                <span>Approval Queue</span>
                {ownerBadge()}
              </span>
            </NavLink>
            <NavLink to={`/group/${groupId}/settings`} className={navLinkClass}>
              <span className="flex w-full items-center justify-between gap-2">
                <span>Group Settings</span>
                {ownerBadge()}
              </span>
            </NavLink>
          </>
        )}
      </nav>

      <div className="border-t border-black/10 px-4 py-2">
        <NavLink
          to="/"
          className="block rounded-lg py-2 text-[12px] text-tour-text-secondary hover:bg-black/[0.04]"
        >
          Home (all groups)
        </NavLink>
        <button
          type="button"
          onClick={() => {
            signOutUser().catch(console.error)
            onNavigate?.()
          }}
          className="mt-0.5 w-full rounded-lg py-2 text-left text-[13px] text-[#A32D2D] hover:bg-red-50"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

export function GroupLayout() {
  const { groupId } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [group, setGroup] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      if (!groupId) return
      try {
        const g = await getGroup(groupId)
        if (active) setGroup(g)
      } catch {
        if (active) setGroup(null)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [groupId])

  const isOwner = Boolean(user?.uid && group?.ownerId === user.uid)

  const title = useMemo(() => {
    const p = location.pathname
    if (p.includes('/activities')) return 'Activities'
    if (p.includes('/info')) return 'Group Info'
    if (p.includes('/approvals')) return 'Pending approvals'
    if (p.includes('/settings')) return 'Group settings'
    if (p.includes('/profile/')) return 'Profile'
    if (p.includes('/feed')) return 'Feed'
    return 'Group'
  }, [location.pathname])

  const profilePath = `/group/${groupId}/profile/${user?.uid || ''}`

  return (
    <div className="flex min-h-dvh bg-tour-muted text-tour-text">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-black/10 bg-tour-surface lg:flex lg:flex-col">
        <div className="shrink-0 border-b border-black/10 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
            Il Tour di Paolo 2026
          </p>
          <p className="truncate text-[13px] font-medium text-tour-text">{group?.name || '…'}</p>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <GroupNavPanel groupId={groupId} user={user} isOwner={isOwner} />
        </div>
      </aside>

      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/35 lg:hidden"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 z-50 flex h-full w-[min(220px,85vw)] flex-col border-r border-black/10 bg-tour-surface shadow-lg lg:hidden">
            <div className="shrink-0 border-b border-black/10 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
                Il Tour di Paolo 2026
              </p>
              <p className="truncate text-[13px] font-medium">{group?.name || '…'}</p>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <GroupNavPanel
                groupId={groupId}
                user={user}
                isOwner={isOwner}
                onNavigate={() => setMenuOpen(false)}
              />
            </div>
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-black/10 bg-tour-surface px-4 py-2.5">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 flex-col items-center justify-center gap-1 rounded-lg hover:bg-black/[0.04] lg:hidden"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <span className="h-px w-[18px] rounded-sm bg-tour-text" />
            <span className="h-px w-[18px] rounded-sm bg-tour-text" />
            <span className="h-px w-[18px] rounded-sm bg-tour-text" />
          </button>
          <div className="min-w-0 flex-1 text-center lg:text-left">
            <p className="truncate text-[15px] font-medium text-tour-text">{title}</p>
            <p className="truncate text-[12px] text-tour-text-secondary lg:hidden">
              {group?.name || '\u00a0'}
            </p>
          </div>
          <NavLink
            to={profilePath}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B5D4F4] text-[12px] font-medium text-[#0C447C] hover:opacity-90"
            title="Profile"
          >
            {user ? userInitials(user) : '?'}
          </NavLink>
        </header>

        <main className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="mx-auto w-full max-w-3xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
