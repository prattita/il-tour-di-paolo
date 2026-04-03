/** Web Push VAPID public key from Firebase Console → Cloud Messaging → Web Push certificates. */
export function getFcmVapidKey() {
  const k = import.meta.env.VITE_FIREBASE_VAPID_KEY
  return typeof k === 'string' && k.trim() ? k.trim() : ''
}

export function isFcmVapidKeyConfigured() {
  return getFcmVapidKey().length > 0
}
