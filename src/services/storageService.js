import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { getFirebaseStorage } from '../lib/firebase'

function requireStorage() {
  const storage = getFirebaseStorage()
  if (!storage) {
    throw new Error('Firebase Storage is not available. Check Firebase configuration.')
  }
  return storage
}

/** Path: `images/{pendingId}/{photoId}/photo` — immutable per submission attempt. */
export async function uploadPendingPhoto(pendingId, photoId, file) {
  const storage = requireStorage()
  const imagePath = `images/${pendingId}/${photoId}/photo`
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
