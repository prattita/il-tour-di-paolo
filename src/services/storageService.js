import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { getFirebaseStorage } from '../lib/firebase'

function requireStorage() {
  const storage = getFirebaseStorage()
  if (!storage) {
    throw new Error('Firebase Storage is not available. Check Firebase configuration.')
  }
  return storage
}

/** Path: `images/{pendingId}/{photoId}/photo` — legacy single-photo upload (random photoId). */
export async function uploadPendingPhoto(pendingId, photoId, file) {
  const storage = requireStorage()
  const imagePath = `images/${pendingId}/${photoId}/photo`
  const storageRef = ref(storage, imagePath)
  await uploadBytes(storageRef, file)
  const imageUrl = await getDownloadURL(storageRef)
  return { imageUrl, imagePath }
}

/**
 * One URL-safe path segment (pendingId is already composite; taskId must not add `/`).
 * @param {string} id
 */
function storagePathSegment(id) {
  if (typeof id !== 'string' || !id.trim()) return '_'
  return id.replace(/\//g, '_').slice(0, 700)
}

/**
 * Multi-photo submission: stable slot 1–3 under `images/{pendingId}/{taskId}/photo_{n}/photo`.
 * taskId isolates blobs per task so later submissions for the same activity do not overwrite
 * objects still referenced by older feed posts (same pendingId, different task).
 * @param {string} pendingId
 * @param {string} taskId
 * @param {1|2|3} slot
 * @param {File} file
 */
export async function uploadPendingPhotoSlot(pendingId, taskId, slot, file) {
  if (slot < 1 || slot > 3) throw new Error('Photo slot must be 1–3.')
  const storage = requireStorage()
  const t = storagePathSegment(taskId)
  const imagePath = `images/${pendingId}/${t}/photo_${slot}/photo`
  const storageRef = ref(storage, imagePath)
  await uploadBytes(storageRef, file)
  const imageUrl = await getDownloadURL(storageRef)
  return { imageUrl, imagePath }
}

export async function deleteSubmissionPhotoByPath(imagePath) {
  if (!imagePath) return
  const storage = requireStorage()
  try {
    await deleteObject(ref(storage, imagePath))
  } catch (e) {
    if (e?.code !== 'storage/object-not-found') throw e
  }
}

/** Delete every path; ignores empty entries. */
export async function deleteSubmissionPhotosByPaths(paths) {
  const list = Array.isArray(paths) ? paths.filter(Boolean) : []
  for (const p of list) {
    await deleteSubmissionPhotoByPath(p)
  }
}
