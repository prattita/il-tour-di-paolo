import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { getFirebaseStorage } from '../lib/firebase'

function requireStorage() {
  const storage = getFirebaseStorage()
  if (!storage) {
    throw new Error('Firebase Storage is not available. Check Firebase configuration.')
  }
  return storage
}

/**
 * Path: `pending/{pendingId}/photo` — matches Storage rules prefix.
 */
export async function uploadPendingPhoto(pendingId, file) {
  const storage = requireStorage()
  const storageRef = ref(storage, `pending/${pendingId}/photo`)
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}
