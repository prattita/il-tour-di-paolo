import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

const MAX_COMMENT_CHARS = 500

export { MAX_COMMENT_CHARS }

/** @param {boolean} nextLiked — true to add this user to `likes`, false to remove */
export async function setFeedPostLiked(groupId, postId, userId, nextLiked) {
  const db = requireDb()
  const ref = doc(db, `groups/${groupId}/feed/${postId}`)
  await updateDoc(ref, nextLiked ? { likes: arrayUnion(userId) } : { likes: arrayRemove(userId) })
}

/**
 * Comments oldest-first (thread order).
 */
export async function listFeedPostComments(groupId, postId) {
  const db = requireDb()
  const q = query(
    collection(db, `groups/${groupId}/feed/${postId}/comments`),
    orderBy('createdAt', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function addFeedPostComment(groupId, postId, { userId, displayName, avatarUrl, text }) {
  const trimmed = text?.trim() ?? ''
  if (!trimmed || trimmed.length > MAX_COMMENT_CHARS) {
    throw new Error(`Comment must be 1–${MAX_COMMENT_CHARS} characters.`)
  }
  const db = requireDb()
  const postRef = doc(db, `groups/${groupId}/feed/${postId}`)
  const commentsCol = collection(db, `groups/${groupId}/feed/${postId}/comments`)
  const commentRef = doc(commentsCol)
  const batch = writeBatch(db)
  batch.set(commentRef, {
    userId,
    displayName: displayName || 'Member',
    avatarUrl: avatarUrl ?? null,
    text: trimmed,
    createdAt: serverTimestamp(),
  })
  batch.update(postRef, { commentCount: increment(1) })
  await batch.commit()
}

export async function deleteFeedPostComment(groupId, postId, commentId) {
  const db = requireDb()
  const postRef = doc(db, `groups/${groupId}/feed/${postId}`)
  const commentRef = doc(db, `groups/${groupId}/feed/${postId}/comments/${commentId}`)
  const postSnap = await getDoc(postRef)
  const n = postSnap.exists() ? postSnap.data().commentCount : undefined
  const batch = writeBatch(db)
  batch.delete(commentRef)
  if (typeof n === 'number' && n > 0) {
    batch.update(postRef, { commentCount: increment(-1) })
  }
  await batch.commit()
}
