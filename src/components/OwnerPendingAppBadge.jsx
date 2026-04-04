import { useAuth } from '../context/useAuth'
import { useOwnerPendingAppBadge } from '../hooks/useOwnerPendingAppBadge'

/** Syncs installable PWA icon badge for group owners (pending queue). Renders nothing. */
export function OwnerPendingAppBadge() {
  const { user } = useAuth()
  useOwnerPendingAppBadge(user?.uid ?? null)
  return null
}
