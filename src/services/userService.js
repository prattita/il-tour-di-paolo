import { arrayRemove, doc, getDoc, onSnapshot, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'

const DEFAULT_NOTIFICATIONS = {
  pushEnabled: false,
  pushToken: null,
}

function buildNewUserDocument({ email, displayName, avatarUrl = null }) {
  const name =
    (displayName && displayName.trim()) ||
    (email && email.split('@')[0]) ||
    'Member'
  return {
    displayName: name,
    email: email || '',
    avatarUrl,
    groupIds: [],
    createdAt: serverTimestamp(),
    notifications: { ...DEFAULT_NOTIFICATIONS },
  }
}

/**
 * Single `getDoc` on `users/{uid}` after Firebase Auth resolves: create profile if missing
 * (DESIGN §5), or add `notifications` for legacy docs. Prefer this on sign-in instead of calling
 * {@link ensureUserProfile} and {@link ensureNotificationDefaults} separately.
 */
export async function ensureUserDocumentOnAuth(uid, { email, displayName, avatarUrl = null }) {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    await setDoc(ref, buildNewUserDocument({ email, displayName, avatarUrl }))
    return
  }
  if (snap.data().notifications != null) return
  await updateDoc(ref, {
    notifications: { ...DEFAULT_NOTIFICATIONS },
  })
}

/**
 * Create `users/{uid}` on first sign-in if it does not exist (DESIGN §5).
 * For auth bootstrap, use {@link ensureUserDocumentOnAuth} to avoid a second read for notifications.
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
  await setDoc(ref, buildNewUserDocument({ email, displayName, avatarUrl }))
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
    notifications: { ...DEFAULT_NOTIFICATIONS },
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
 * One `getDoc(users/{uid})`, parallel `getDoc(groups/{gid})`, reuse snapshots for the list,
 * batch `arrayRemove` for stale ids. Prefer this on the home screen over separate prune +
 * `getUserGroupIds` + `getGroupsByIds` (avoids duplicate reads and serial prune latency).
 *
 * @returns {Promise<Array<{ id: string } & Record<string, unknown>>>}
 */
export async function loadUserGroupsForHome(uid) {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  const userRef = doc(db, 'users', uid)
  const userSnap = await getDoc(userRef)
  if (!userSnap.exists()) return []

  const raw = userSnap.data().groupIds
  const groupIds = Array.isArray(raw) ? raw : []
  const uniqueIds = [...new Set(groupIds.filter((id) => typeof id === 'string' && id))]
  if (uniqueIds.length === 0) return []

  const fetched = await Promise.all(
    uniqueIds.map(async (gid) => {
      try {
        const gSnap = await getDoc(doc(db, 'groups', gid))
        return { gid, snap: gSnap, denied: false }
      } catch (e) {
        if (e?.code === 'permission-denied') return { gid, snap: null, denied: true }
        throw e
      }
    }),
  )

  const stale = []
  const validGroups = []
  for (let i = 0; i < uniqueIds.length; i += 1) {
    const { gid, snap, denied } = fetched[i]
    if (denied) {
      stale.push(gid)
      continue
    }
    if (!snap.exists()) {
      stale.push(gid)
      continue
    }
    const memberIds = snap.data().memberIds || []
    if (!memberIds.includes(uid)) {
      stale.push(gid)
      continue
    }
    validGroups.push({ id: snap.id, ...snap.data() })
  }

  if (stale.length > 0) {
    const uniqueStale = [...new Set(stale)]
    await updateDoc(userRef, { groupIds: arrayRemove(...uniqueStale) })
  }

  return validGroups
}

/**
 * Drops groupIds the user can no longer read or is not a member of (e.g. after owner removal).
 * Firestore rules do not allow owners to edit other users' `users/` docs, so removals only
 * update the group; this self-heals on next home visit.
 * Delegates to {@link loadUserGroupsForHome} when Firestore is available (same read/write pattern as home).
 */
export async function pruneStaleGroupIdsFromUser(uid) {
  const db = getFirebaseDb()
  if (!db) return
  await loadUserGroupsForHome(uid)
}
