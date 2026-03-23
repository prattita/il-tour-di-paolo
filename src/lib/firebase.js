import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

/**
 * Firebase config from Vite env (see `.env.example`).
 * Never commit real keys — `.env` is gitignored.
 */
function buildConfig() {
  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    // Optional — used if you wire Firebase Analytics later; safe to omit
    ...(measurementId ? { measurementId } : {}),
  }
}

function isConfigComplete(config) {
  return Boolean(
    config.apiKey &&
      config.projectId &&
      config.appId &&
      config.authDomain &&
      config.storageBucket &&
      config.messagingSenderId,
  )
}

let _app = null

/**
 * Returns the Firebase app if env vars are set; otherwise `null` (app still runs for UI work).
 */
export function getFirebaseApp() {
  if (_app) return _app
  if (getApps().length > 0) {
    _app = getApps()[0]
    return _app
  }
  const config = buildConfig()
  if (!isConfigComplete(config)) {
    if (import.meta.env.DEV) {
      console.warn(
        '[firebase] Missing VITE_FIREBASE_* variables — copy .env.example to .env and add your Firebase project keys.',
      )
    }
    return null
  }
  _app = initializeApp(config)
  return _app
}

export function getFirebaseAuth() {
  const app = getFirebaseApp()
  return app ? getAuth(app) : null
}

export function getFirebaseDb() {
  const app = getFirebaseApp()
  return app ? getFirestore(app) : null
}

export function getFirebaseStorage() {
  const app = getFirebaseApp()
  return app ? getStorage(app) : null
}
