import { useAuth } from '../context/useAuth'
import { signOutUser } from '../services/authService'

export function HomePage() {
  const { user } = useAuth()

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
          Phase 3 will add groups and navigation. For now you&apos;re authenticated.
        </p>
      </main>
    </div>
  )
}
