import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { PageLoading } from './PageLoading'

/** Redirect signed-in users away from `/auth` to home. */
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <PageLoading layout="fullscreen" />
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return children
}
