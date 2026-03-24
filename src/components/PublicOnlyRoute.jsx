import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

/** Redirect signed-in users away from `/auth` to home. */
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-slate-600">
        <p className="text-sm">Loading…</p>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return children
}
