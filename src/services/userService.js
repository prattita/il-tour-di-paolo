import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'

/**
 * Create `users/{uid}` on first sign-in if it does not exist (DESIGN §5).
 */
export async function ensureUserProfile(uid, { email, displayName, avatarUrl = null }) {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    return
  }
  const name =
    (displayName && displayName.trim()) ||
    (email && email.split('@')[0]) ||
    'Member'
  await setDoc(ref, {
    displayName: name,
    email: email || '',
    avatarUrl,
    groupIds: [],
    createdAt: serverTimestamp(),
  })
}

export async function getUserGroupIds(uid) {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return []
  const groupIds = snap.data().groupIds
  return Array.isArray(groupIds) ? groupIds : []
}
