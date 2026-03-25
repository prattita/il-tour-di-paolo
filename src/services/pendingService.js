import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'
import { uploadPendingPhoto } from './storageService'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

/** Composite pending doc id — must match Firestore rules. */
export function makePendingDocId(userId, activityId) {
  return `${userId}_${activityId}`
}

export async function getPendingSubmission(groupId, userId, activityId) {
  const db = requireDb()
  const pendingId = makePendingDocId(userId, activityId)
  const snap = await getDoc(doc(db, `groups/${groupId}/pending/${pendingId}`))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export function subscribePendingSubmission(groupId, userId, activityId, onData, onError) {
  const db = requireDb()
  const pendingId = makePendingDocId(userId, activityId)
  const pendingRef = doc(db, `groups/${groupId}/pending/${pendingId}`)
  return onSnapshot(
    pendingRef,
    (snap) => {
      onData(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    },
    onError,
  )
}

/**
 * Upload image, then create pending doc. Fails if pending already exists for this user+activity.
 */
export async function createPendingSubmission({
  groupId,
  userId,
  displayName,
  activityId,
  activityName,
  taskId,
  taskName,
  imageFile,
  description,
}) {
  const db = requireDb()
  const pendingId = makePendingDocId(userId, activityId)
  const pendingRef = doc(db, `groups/${groupId}/pending/${pendingId}`)

  const existing = await getDoc(pendingRef)
  if (existing.exists()) {
    throw new Error('You already have a submission awaiting review for this activity.')
  }

  const imageUrl = await uploadPendingPhoto(pendingId, imageFile)

  await setDoc(pendingRef, {
    userId,
    displayName,
    activityId,
    activityName,
    taskId,
    taskName,
    imageUrl,
    description: description?.trim() || null,
    submittedAt: serverTimestamp(),
  })
}
