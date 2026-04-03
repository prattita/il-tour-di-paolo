import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-slate-600">
        <p className="text-sm">{t('common.loadingShort')}</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  }

  return children
}
