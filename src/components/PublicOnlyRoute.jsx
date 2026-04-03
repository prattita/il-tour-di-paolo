import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'

/** Redirect signed-in users away from `/auth` to home. */
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth()
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-slate-600">
        <p className="text-sm">{t('common.loadingShort')}</p>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return children
}
