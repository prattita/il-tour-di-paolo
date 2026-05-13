import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { PageLoading } from './PageLoading'

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <PageLoading layout="fullscreen" />
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  return children
}
