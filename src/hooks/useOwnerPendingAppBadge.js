import { useEffect } from 'react'
import { getFirebaseDb } from '../lib/firebase'
import { clearAppBadgeIfSupported, setAppBadgeCount } from '../lib/appBadge'
import { getOwnerPendingSubmissionCount } from '../services/ownerPendingBadgeService'

/**
 * Home Screen PWA badge: while the app is **hidden**, show the owner’s total pending
 * submission count; when the app is **visible**, clear the badge (read-at-a-glance UX).
 *
 * Non-owners always get count 0 → no badge when backgrounded.
 */
export function useOwnerPendingAppBadge(uid) {
  useEffect(() => {
    if (!uid) {
      void clearAppBadgeIfSupported()
      return undefined
    }

    const apply = async () => {
      const db = getFirebaseDb()
      if (!db) return

      if (document.visibilityState === 'visible') {
        await clearAppBadgeIfSupported()
        return
      }

      const n = await getOwnerPendingSubmissionCount(db, uid)
      await setAppBadgeCount(n)
    }

    void apply()

    const onVisibility = () => {
      void apply()
    }

    // iOS Home Screen PWA often skips visibilitychange when locking; blur/pagehide help.
    const onHideSignals = () => {
      void apply()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onHideSignals)
    window.addEventListener('blur', onHideSignals)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onHideSignals)
      window.removeEventListener('blur', onHideSignals)
      void clearAppBadgeIfSupported()
    }
  }, [uid])
}
