import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { joinGroupByInviteCode } from '../services/groupService'

export function JoinGroupPage() {
  const { inviteCode: inviteCodeFromUrl } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [inviteCode, setInviteCode] = useState(inviteCodeFromUrl || '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setInviteCode(inviteCodeFromUrl || '')
  }, [inviteCodeFromUrl])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      if (!user) throw new Error('You must be logged in.')
      const result = await joinGroupByInviteCode({
        inviteCode,
        userId: user.uid,
        userDisplayName: user.displayName || user.email || 'Member',
        userAvatarUrl: user.photoURL || null,
      })
      navigate(`/group/${result.groupId}/feed`, { replace: true })
    } catch (err) {
      setError(err.message || 'Failed to join group.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-dvh text-tour-text">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-tour-text-secondary">Phase 3</p>
          <h1 className="mt-1 text-2xl font-semibold text-tour-text">Join Group</h1>
          <p className="mt-2 text-sm text-tour-text-secondary">
            Enter an invite code to join your family group.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-black/10 bg-tour-surface p-4">
          <div>
            <label htmlFor="inviteCode" className="mb-1 block text-sm font-medium text-tour-text">
              Invite code
            </label>
            <input
              id="inviteCode"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2 text-tour-text shadow-sm focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent"
              placeholder="PAOLO26"
              required
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-tour-accent py-2.5 text-sm font-medium text-tour-accent-muted hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Joining…' : 'Join group'}
          </button>
        </form>

        <Link
          to="/"
          className="mt-4 self-start rounded-lg border border-black/10 bg-tour-surface px-3 py-1.5 text-sm font-medium text-tour-text hover:bg-tour-muted"
        >
          Back home
        </Link>
      </main>
    </div>
  )
}
