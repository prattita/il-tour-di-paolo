import { useEffect, useState } from 'react'
import { getToken, onMessage } from 'firebase/messaging'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { getFcmVapidKey, isFcmVapidKeyConfigured } from '../lib/fcmConfig'
import { getFirebaseDb } from '../lib/firebase'
import { getFirebaseMessagingWhenReady } from '../lib/firebaseMessaging'

/**
 * Refreshes the FCM token when push is enabled, wires foreground `onMessage`, and shows a small banner.
 */
export function FcmForegroundBanner() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (!user?.uid) return undefined

    let unsubForeground = () => {}
    let cancelled = false

    ;(async () => {
      const messaging = await getFirebaseMessagingWhenReady()
      if (cancelled || !messaging) return

      unsubForeground = onMessage(messaging, (payload) => {
        const n = payload.notification
        setTitle((n && n.title) || '')
        setBody((n && n.body) || '')
        setOpen(true)
      })

      if (!isFcmVapidKeyConfigured()) return
      const db = getFirebaseDb()
      if (!db) return

      try {
        const snap = await getDoc(doc(db, 'users', user.uid))
        if (cancelled || !snap.exists()) return
        const n = snap.data().notifications
        if (!n?.pushEnabled || Notification.permission !== 'granted') return

        const token = await getToken(messaging, { vapidKey: getFcmVapidKey() })
        if (cancelled || !token || token === n.pushToken) return
        await updateDoc(doc(db, 'users', user.uid), { 'notifications.pushToken': token })
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[fcm] token refresh skipped', e)
      }
    })()

    return () => {
      cancelled = true
      unsubForeground()
    }
  }, [user?.uid])

  if (!open) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-lg border border-black/15 bg-tour-surface px-4 py-3 shadow-lg sm:left-auto sm:right-4 sm:mx-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title ? <p className="text-sm font-semibold text-tour-text">{title}</p> : null}
          {body ? <p className="mt-0.5 text-sm text-tour-text-secondary">{body}</p> : null}
          {!title && !body ? (
            <p className="text-sm text-tour-text-secondary">{t('settings.pushForegroundFallback')}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-tour-accent hover:bg-tour-accent-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent/40"
        >
          {t('settings.pushForegroundDismiss')}
        </button>
      </div>
    </div>
  )
}
