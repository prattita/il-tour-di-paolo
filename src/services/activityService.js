import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query } from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

/**
 * Activities for a group, sorted by `sortOrder` then name.
 */
export async function listActivities(groupId) {
  const db = requireDb()
  const q = query(collection(db, `groups/${groupId}/activities`), orderBy('sortOrder', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Subscribe to activities (real-time).
 */
export function subscribeActivities(groupId, onData, onError) {
  const db = requireDb()
  const q = query(collection(db, `groups/${groupId}/activities`), orderBy('sortOrder', 'asc'))
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    onError,
  )
}

/**
 * Current user's member doc in the group (progress, displayName, etc.).
 */
export async function getGroupMember(groupId, userId) {
  const db = requireDb()
  const snap = await getDoc(doc(db, `groups/${groupId}/members/${userId}`))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export function subscribeGroupMember(groupId, userId, onData, onError) {
  const db = requireDb()
  const ref = doc(db, `groups/${groupId}/members/${userId}`)
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    },
    onError,
  )
}
