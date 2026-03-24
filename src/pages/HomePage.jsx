import { useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { signOutUser } from '../services/authService'
import { Link } from 'react-router-dom'
import { getUserGroupIds } from '../services/userService'
import { getGroupsByIds } from '../services/groupService'

export function HomePage() {
  const { user } = useAuth()
  const [groups, setGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(true)
  const [groupError, setGroupError] = useState('')

  useEffect(() => {
    let active = true
    async function loadGroups() {
      if (!user?.uid) {
        if (active) {
          setGroups([])
          setLoadingGroups(false)
        }
        return
      }
      setLoadingGroups(true)
      setGroupError('')
      try {
        const groupIds = await getUserGroupIds(user.uid)
        const groupDocs = await getGroupsByIds(groupIds)
        if (active) {
          setGroups(groupDocs)
        }
      } catch (e) {
        if (active) {
          setGroupError(e.message || 'Failed to load groups.')
        }
      } finally {
        if (active) {
          setLoadingGroups(false)
        }
      }
    }
    loadGroups()
    return () => {
      active = false
    }
  }, [user?.uid])

  async function handleSignOut() {
    try {
      await signOutUser()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Il Tour di Paolo
            </p>
            <h1 className="mt-1 text-xl font-semibold text-slate-800">Home</h1>
            <p className="mt-2 text-sm text-slate-600">
              Signed in as{' '}
              <span className="font-medium text-slate-800">
                {user?.displayName || user?.email || user?.uid}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </header>
        <p className="text-sm text-slate-600">
          Phase 3 started: create or join your group to continue.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/group/new"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
          >
            Create group
          </Link>
          <Link
            to="/join"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Join with invite code
          </Link>
        </div>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Your groups</h2>
          {loadingGroups && <p className="mt-2 text-sm text-slate-600">Loading groups…</p>}
          {!loadingGroups && groupError && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-sm text-red-800">
              {groupError}
            </p>
          )}
          {!loadingGroups && !groupError && groups.length === 0 && (
            <p className="mt-2 text-sm text-slate-600">No groups yet. Create one or join with an invite code.</p>
          )}
          {!loadingGroups && !groupError && groups.length > 0 && (
            <ul className="mt-3 space-y-2">
              {groups.map((group) => (
                <li key={group.id}>
                  <Link
                    to={`/group/${group.id}/feed`}
                    className="block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50"
                  >
                    <span className="font-medium">{group.name || 'Untitled group'}</span>
                    <span className="ml-2 text-slate-500">({group.memberIds?.length || 0} members)</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
