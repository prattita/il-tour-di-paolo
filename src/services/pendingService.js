import { deleteDoc, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'
import { getGroupMember } from './activityService'
import { deleteSubmissionPhotoByPath, uploadPendingPhoto } from './storageService'

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

  const photoId =
    globalThis.crypto?.randomUUID?.() ||
    `p_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const { imageUrl, imagePath } = await uploadPendingPhoto(
    pendingId,
    photoId,
    imageFile,
  )

  const member = await getGroupMember(groupId, userId)
  const avatarUrl = member?.avatarUrl ?? null

  await setDoc(pendingRef, {
    userId,
    displayName,
    avatarUrl,
    activityId,
    activityName,
    taskId,
    taskName,
    imageUrl,
    imagePath,
    description: description?.trim() || null,
    submittedAt: serverTimestamp(),
  })
}

/**
 * Member withdraws their own pending submission (Phase 9). Unlocks other tasks in the activity.
 * Does not set rejectionBanner (unlike owner reject).
 */
export async function withdrawPendingSubmission(groupId, userId, pendingId, pending) {
  if (!pending?.userId || pending.userId !== userId) {
    throw new Error('You can only withdraw your own submission.')
  }
  if (makePendingDocId(userId, pending.activityId) !== pendingId) {
    throw new Error('Invalid pending submission.')
  }
  const db = requireDb()
  const pendingRef = doc(db, `groups/${groupId}/pending/${pendingId}`)
  await deleteDoc(pendingRef)
  const fallbackPath = `images/${pendingId}/photo`
  await deleteSubmissionPhotoByPath(pending.imagePath || fallbackPath)
}
