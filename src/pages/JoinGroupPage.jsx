import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { joinGroupByInviteCode } from '../services/groupService'

const inputClass =
  'min-h-11 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2.5 text-tour-text shadow-sm focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent'

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
    <div className="min-h-dvh bg-tour-muted text-tour-text">
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-8 sm:px-5 sm:py-10">
        <div className="mx-auto w-full max-w-md">
          <header className="mb-6">
            <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
              Il Tour di Paolo
            </p>
            <h1 className="mt-1 text-xl font-semibold text-tour-text sm:text-2xl">Join group</h1>
            <p className="mt-2 text-sm text-tour-text-secondary">
              Enter an invite code from your group owner.
            </p>
          </header>

          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-xl border border-black/10 bg-tour-surface p-5 sm:p-6"
          >
            <div>
              <label htmlFor="inviteCode" className="mb-1.5 block text-sm font-medium text-tour-text">
                Invite code
              </label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className={inputClass}
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
              className="min-h-11 w-full rounded-lg bg-tour-accent px-4 py-3 text-sm font-medium text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Joining…' : 'Join group'}
            </button>
          </form>

          <Link
            to="/"
            className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-black/10 bg-tour-surface px-4 py-2.5 text-sm font-medium text-tour-text hover:bg-tour-muted"
          >
            Back to welcome
          </Link>
        </div>
      </main>
    </div>
  )
}
