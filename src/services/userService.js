import { arrayRemove, doc, getDoc, onSnapshot, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
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
    notifications: {
      pushEnabled: false,
      pushToken: null,
    },
  })
}

/** Adds `notifications` to legacy `users/{uid}` docs that predate the notifications feature. */
export async function ensureNotificationDefaults(uid) {
  const db = getFirebaseDb()
  if (!db || !uid) return
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  if (snap.data().notifications != null) return
  await updateDoc(ref, {
    notifications: {
      pushEnabled: false,
      pushToken: null,
    },
  })
}

/** Real-time `users/{uid}` for global UI (e.g. account settings avatar). */
export function subscribeUserProfile(uid, onData, onError) {
  const db = getFirebaseDb()
  if (!db) {
    onError?.(new Error('Firestore is not available.'))
    return () => {}
  }
  const ref = doc(db, 'users', uid)
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    },
    (e) => onError?.(e),
  )
}

/**
 * Avatar to denormalize into `groups/.../members/{uid}` — prefers Firestore `users/{uid}.avatarUrl`
 * (custom upload) over Auth `photoURL` (e.g. default Google image).
 */
export async function getUserAvatarUrlForMember(uid, fallbackFromAuth = null) {
  if (!uid) return typeof fallbackFromAuth === 'string' && fallbackFromAuth.trim() ? fallbackFromAuth.trim() : null
  const db = getFirebaseDb()
  if (!db) {
    return typeof fallbackFromAuth === 'string' && fallbackFromAuth.trim() ? fallbackFromAuth.trim() : null
  }
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (snap.exists()) {
      const url = snap.data()?.avatarUrl
      if (typeof url === 'string' && url.trim().length > 0) {
        return url.trim()
      }
    }
  } catch {
    // fall through to Auth URL
  }
  return typeof fallbackFromAuth === 'string' && fallbackFromAuth.trim().length > 0
    ? fallbackFromAuth.trim()
    : null
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

/**
 * Drops groupIds the user can no longer read or is not a member of (e.g. after owner removal).
 * Firestore rules do not allow owners to edit other users' `users/` docs, so removals only
 * update the group; this self-heals on next home visit.
 */
export async function pruneStaleGroupIdsFromUser(uid) {
  const db = getFirebaseDb()
  if (!db) return
  const userRef = doc(db, 'users', uid)
  const userSnap = await getDoc(userRef)
  if (!userSnap.exists()) return
  const groupIds = userSnap.data().groupIds
  if (!Array.isArray(groupIds) || groupIds.length === 0) return

  const stale = []
  for (const gid of groupIds) {
    if (typeof gid !== 'string' || !gid) continue
    try {
      const gSnap = await getDoc(doc(db, 'groups', gid))
      if (!gSnap.exists()) {
        stale.push(gid)
        continue
      }
      const memberIds = gSnap.data().memberIds || []
      if (!memberIds.includes(uid)) stale.push(gid)
    } catch (e) {
      if (e?.code === 'permission-denied') stale.push(gid)
      else throw e
    }
  }

  for (const gid of stale) {
    await updateDoc(userRef, { groupIds: arrayRemove(gid) })
  }
}
