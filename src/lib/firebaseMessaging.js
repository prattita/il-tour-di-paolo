import { getMessaging, isSupported } from 'firebase/messaging'
import { getFirebaseApp } from './firebase'

let messagingPromise = null
let messagingUnsupported = false

/**
 * Resolves Firebase Messaging for this browser, or `null` if the app/config is missing
 * or the browser does not support FCM (e.g. some Safari without PWA install).
 */
export function getFirebaseMessagingWhenReady() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (messagingUnsupported) return Promise.resolve(null)
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const app = getFirebaseApp()
      if (!app) return null
      const ok = await isSupported()
      if (!ok) {
        messagingUnsupported = true
        return null
      }
      return getMessaging(app)
    })()
  }
  return messagingPromise
}
