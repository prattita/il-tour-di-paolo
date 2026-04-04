import { deleteDoc, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { getCompoundCount, getCompoundTarget, isCompoundTask } from '../lib/compoundTask'
import { getFirebaseDb } from '../lib/firebase'
import { getImageDimensionsFromFile } from '../lib/imageDimensions'
import { pendingPhotoStoragePaths } from '../lib/feedPhotos'
import { getGroupMember } from './activityService'
import {
  deleteSubmissionPhotosByPaths,
  uploadPendingPhotoSlot,
} from './storageService'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

export const MIN_SUBMISSION_PHOTOS = 1
export const MAX_SUBMISSION_PHOTOS = 3

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
 * Upload 1–3 images, then create pending doc. Fails if pending already exists for this user+activity.
 * @param {object} params
 * @param {File[]} params.imageFiles — 1–3 images, ordered
 */
export async function createPendingSubmission({
  groupId,
  userId,
  displayName,
  activityId,
  activityName,
  taskId,
  taskName,
  imageFiles,
  description,
}) {
  const files = Array.isArray(imageFiles) ? imageFiles.filter((f) => f instanceof File) : []
  if (files.length < MIN_SUBMISSION_PHOTOS) {
    throw new Error('Please add at least one photo.')
  }
  if (files.length > MAX_SUBMISSION_PHOTOS) {
    throw new Error(`You can add at most ${MAX_SUBMISSION_PHOTOS} photos.`)
  }

  const db = requireDb()
  const pendingId = makePendingDocId(userId, activityId)
  const pendingRef = doc(db, `groups/${groupId}/pending/${pendingId}`)

  const existing = await getDoc(pendingRef)
  if (existing.exists()) {
    throw new Error('You already have a submission awaiting review for this activity.')
  }

  const activityRef = doc(db, `groups/${groupId}/activities`, activityId)
  const activitySnap = await getDoc(activityRef)
  if (!activitySnap.exists()) {
    throw new Error('Activity not found.')
  }
  const actTasks = activitySnap.data().tasks || []
  const taskDef = actTasks.find((x) => x.id === taskId)
  if (!taskDef) {
    throw new Error('Task not found.')
  }

  const member = await getGroupMember(groupId, userId)
  if (isCompoundTask(taskDef)) {
    const x = getCompoundCount(member, activityId, taskId)
    const y = getCompoundTarget(taskDef)
    if (x !== y) {
      throw new Error('Track all steps before submitting (counter must reach the goal).')
    }
  }

  const photos = []
  for (let i = 0; i < files.length; i++) {
    const slot = i + 1
    const file = files[i]
    const { imageUrl, imagePath } = await uploadPendingPhotoSlot(pendingId, slot, file)
    const { width, height } = await getImageDimensionsFromFile(file)
    photos.push({ url: imageUrl, path: imagePath, width, height })
  }

  const avatarUrl = member?.avatarUrl ?? null

  await setDoc(pendingRef, {
    userId,
    displayName,
    avatarUrl,
    activityId,
    activityName,
    taskId,
    taskName,
    photos,
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
  await deleteSubmissionPhotosByPaths(pendingPhotoStoragePaths(pending))
}
