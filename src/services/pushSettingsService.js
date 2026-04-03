import { deleteToken, getToken } from 'firebase/messaging'
import { doc, updateDoc } from 'firebase/firestore'
import { getFcmVapidKey, isFcmVapidKeyConfigured } from '../lib/fcmConfig'
import { getFirebaseDb } from '../lib/firebase'
import { getFirebaseMessagingWhenReady } from '../lib/firebaseMessaging'

export async function enableWebPushForUser(uid) {
  if (!uid) throw new Error('Not signed in.')
  if (!isFcmVapidKeyConfigured()) {
    throw new Error('Push is not configured (missing VITE_FIREBASE_VAPID_KEY).')
  }
  const db = getFirebaseDb()
  if (!db) throw new Error('Firestore is not available.')

  const messaging = await getFirebaseMessagingWhenReady()
  if (!messaging) {
    throw new Error('Push notifications are not supported in this browser.')
  }

  const perm = Notification.permission
  if (perm === 'denied') {
    throw new Error('Notifications are blocked for this site.')
  }
  if (perm === 'default') {
    const next = await Notification.requestPermission()
    if (next !== 'granted') {
      throw new Error('Notification permission was not granted.')
    }
  }

  const token = await getToken(messaging, { vapidKey: getFcmVapidKey() })
  if (!token) {
    throw new Error('Could not obtain a push token.')
  }

  await updateDoc(doc(db, 'users', uid), {
    'notifications.pushEnabled': true,
    'notifications.pushToken': token,
  })
}

export async function disableWebPushForUser(uid) {
  if (!uid) return
  const db = getFirebaseDb()
  if (!db) return

  const messaging = await getFirebaseMessagingWhenReady()
  if (messaging) {
    try {
      await deleteToken(messaging)
    } catch {
      // Token may already be revoked or stale
    }
  }

  await updateDoc(doc(db, 'users', uid), {
    'notifications.pushEnabled': false,
    'notifications.pushToken': null,
  })
}
