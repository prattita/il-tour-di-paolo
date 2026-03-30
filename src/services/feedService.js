import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

/** Feed v2 head + “Load more” page size (see docs/phase-one/groupfeedpagev2-onepager.md). */
export const FEED_PAGE_SIZE = 20

function timestampMillis(ts) {
  if (!ts) return 0
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (typeof ts.seconds === 'number') return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6)
  return 0
}

/**
 * Merge head posts with older pages; head ids win — drop duplicates from older segments.
 * Preserves order: head (desc), then each older page in fetch order (each page desc).
 */
export function mergeFeedPosts(headSnaps, olderPageSnaps) {
  const headPosts = headSnaps.map((d) => ({ id: d.id, ...d.data() }))
  const headIds = new Set(headPosts.map((p) => p.id))
  const tail = []
  for (const page of olderPageSnaps) {
    for (const d of page) {
      if (!headIds.has(d.id)) {
        headIds.add(d.id)
        tail.push({ id: d.id, ...d.data() })
      }
    }
  }
  return [...headPosts, ...tail]
}

/** Map post id → QueryDocumentSnapshot (head overwrites older on conflict). */
export function buildFeedSnapMap(headSnaps, olderPageSnaps) {
  const map = new Map()
  for (const page of olderPageSnaps) {
    for (const d of page) {
      if (!map.has(d.id)) map.set(d.id, d)
    }
  }
  for (const d of headSnaps) {
    map.set(d.id, d)
  }
  return map
}

/** Cursor for next `fetchFeedOlderPage`: snapshot of chronologically oldest merged post. */
export function getOldestMergedFeedSnapshot(mergedPostsDescending, snapMap) {
  if (mergedPostsDescending.length === 0) return null
  const last = mergedPostsDescending[mergedPostsDescending.length - 1]
  return snapMap.get(last.id) ?? null
}

/**
 * Newest-first feed head; real-time. Callback receives posts + raw doc snapshots for pagination.
 */
export function subscribeGroupFeedHead(groupId, onData, onError) {
  const db = requireDb()
  const q = query(
    collection(db, `groups/${groupId}/feed`),
    orderBy('timestamp', 'desc'),
    limit(FEED_PAGE_SIZE),
  )
  return onSnapshot(
    q,
    (snap) => {
      onData({
        posts: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        snapshots: snap.docs,
      })
    },
    onError,
  )
}

/**
 * One-shot older page. Pass cursor from {@link getOldestMergedFeedSnapshot}.
 */
export async function getFeedPost(groupId, postId) {
  const db = requireDb()
  const snap = await getDoc(doc(db, `groups/${groupId}/feed/${postId}`))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export async function fetchFeedOlderPage(groupId, cursorSnapshot) {
  if (!cursorSnapshot) {
    return { posts: [], snapshots: [], hasMore: false }
  }
  const db = requireDb()
  const q = query(
    collection(db, `groups/${groupId}/feed`),
    orderBy('timestamp', 'desc'),
    startAfter(cursorSnapshot),
    limit(FEED_PAGE_SIZE),
  )
  const snap = await getDocs(q)
  return {
    posts: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    snapshots: snap.docs,
    hasMore: snap.docs.length === FEED_PAGE_SIZE,
  }
}

export { timestampMillis }
