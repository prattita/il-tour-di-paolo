import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

const FEED_PAGE_SIZE = 50

/**
 * Approved posts, newest first (group members only per Firestore rules).
 */
export function subscribeGroupFeed(groupId, onData, onError) {
  const db = requireDb()
  const q = query(
    collection(db, `groups/${groupId}/feed`),
    orderBy('timestamp', 'desc'),
    limit(FEED_PAGE_SIZE),
  )
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    onError,
  )
}
