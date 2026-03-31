import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'
import { medalTierFromTasksCompleted } from '../lib/medalTier'
import { makePendingDocId } from './pendingService'
import { pendingPhotoStoragePaths } from '../lib/feedPhotos'
import { deleteSubmissionPhotosByPaths } from './storageService'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

function feedMedalFromTasksCompleted(tasksCompleted) {
  const tier = medalTierFromTasksCompleted(tasksCompleted)
  return tier === 'none' ? null : tier
}

/**
 * Owner-only: real-time list of pending submissions, newest first.
 */
export function subscribePendingQueue(groupId, onData, onError) {
  const db = requireDb()
  const q = query(collection(db, `groups/${groupId}/pending`), orderBy('submittedAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    onError,
  )
}

/**
 * Owner-only: pending doc count (e.g. settings badge).
 */
export function subscribePendingCount(groupId, onCount, onError) {
  const db = requireDb()
  return onSnapshot(
    collection(db, `groups/${groupId}/pending`),
    (snap) => onCount(snap.size),
    onError,
  )
}

/**
 * @param {object} pending — doc data including userId, activityId, taskId, etc.
 */
export async function approvePendingSubmission(groupId, pendingId, pending) {
  const db = requireDb()
  if (makePendingDocId(pending.userId, pending.activityId) !== pendingId) {
    throw new Error('Invalid pending submission.')
  }

  const fromPhotos =
    Array.isArray(pending.photos) && pending.photos.length > 0 ? pending.photos : null
  const fromLegacy =
    typeof pending.imageUrl === 'string' && pending.imageUrl.length > 0
      ? [
          {
            url: pending.imageUrl,
            path: typeof pending.imagePath === 'string' ? pending.imagePath : '',
            width:
              typeof pending.imageWidth === 'number' && pending.imageWidth > 0
                ? pending.imageWidth
                : 4,
            height:
              typeof pending.imageHeight === 'number' && pending.imageHeight > 0
                ? pending.imageHeight
                : 3,
          },
        ]
      : null
  const photos = fromPhotos || fromLegacy
  if (!photos || photos.length === 0) {
    throw new Error('This submission has no photos to approve.')
  }

  const feedPostRef = doc(collection(db, `groups/${groupId}/feed`))

  const memberRef = doc(db, `groups/${groupId}/members/${pending.userId}`)
  const activityRef = doc(db, `groups/${groupId}/activities/${pending.activityId}`)
  const pendingDocRef = doc(db, `groups/${groupId}/pending/${pendingId}`)

  await runTransaction(db, async (transaction) => {
    const memberSnap = await transaction.get(memberRef)
    const activitySnap = await transaction.get(activityRef)
    if (!memberSnap.exists()) throw new Error('Member not found.')
    if (!activitySnap.exists()) throw new Error('Activity not found.')

    const activityData = activitySnap.data()
    const validTaskIds = new Set((activityData.tasks || []).map((t) => t.id))
    if (!validTaskIds.has(pending.taskId)) {
      throw new Error('This task is not part of the activity.')
    }

    const progress = { ...(memberSnap.data().progress || {}) }
    const prev = progress[pending.activityId] || { tasksCompleted: 0, completedTaskIds: [] }
    const completed = new Set(
      (prev.completedTaskIds || []).filter((id) => validTaskIds.has(id)),
    )
    completed.add(pending.taskId)
    const completedTaskIds = [...completed]
    const tasksCompleted = Math.min(3, completedTaskIds.length)
    progress[pending.activityId] = {
      tasksCompleted,
      completedTaskIds,
    }

    const medal = feedMedalFromTasksCompleted(tasksCompleted)
    const rb = memberSnap.data().rejectionBanner
    const clearRejection = rb && rb.activityId === pending.activityId
    const memberAvatarUrl = memberSnap.data().avatarUrl ?? null

    transaction.set(feedPostRef, {
      userId: pending.userId,
      displayName: pending.displayName,
      avatarUrl: memberAvatarUrl,
      activityId: pending.activityId,
      activityName: pending.activityName,
      taskId: pending.taskId,
      taskName: pending.taskName,
      medal,
      photos,
      description: pending.description ?? null,
      type: 'task_completion',
      timestamp: serverTimestamp(),
      likes: [],
      commentCount: 0,
    })

    const memberUpdate = { progress }
    if (clearRejection) {
      memberUpdate.rejectionBanner = deleteField()
    }
    transaction.update(memberRef, memberUpdate)

    if (!activityData.isLocked) {
      transaction.update(activityRef, { isLocked: true })
    }

    transaction.delete(pendingDocRef)
  })
}

export async function rejectPendingSubmission(groupId, pendingId, pending) {
  const db = requireDb()
  const memberRef = doc(db, `groups/${groupId}/members/${pending.userId}`)
  const pendingDocRef = doc(db, `groups/${groupId}/pending/${pendingId}`)

  const batch = writeBatch(db)
  batch.update(memberRef, {
    rejectionBanner: {
      taskName: pending.taskName,
      taskId: pending.taskId,
      activityId: pending.activityId,
      rejectedAt: serverTimestamp(),
    },
  })
  batch.delete(pendingDocRef)
  await batch.commit()
  await deleteSubmissionPhotosByPaths(pendingPhotoStoragePaths(pending))
}
