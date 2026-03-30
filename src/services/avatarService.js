import { doc, getDoc, writeBatch } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { getFirebaseDb, getFirebaseStorage } from '../lib/firebase'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

function requireStorage() {
  const storage = getFirebaseStorage()
  if (!storage) {
    throw new Error('Firebase Storage is not available. Check Firebase configuration.')
  }
  return storage
}

const MAX_BATCH_OPS = 450

/**
 * Upload file to `avatars/{userId}` (overwrites), then refresh download URL and batch-update
 * `users/{userId}` and each `groups/{g}/members/{userId}` where the member doc still exists and
 * the user is still in `group.memberIds` (skips stale `groupIds`).
 */
export async function uploadUserAvatarAndSyncGroups(userId, file) {
  if (!userId || !file) {
    throw new Error('Missing user or file.')
  }
  if (!file.type?.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Image must be 8MB or smaller.')
  }

  const storage = requireStorage()
  const storagePath = `avatars/${userId}`
  const storageRef = ref(storage, storagePath)
  const contentType = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg'
  await uploadBytes(storageRef, file, { contentType })
  const newAvatarUrl = await getDownloadURL(storageRef)

  const db = requireDb()
  const userRef = doc(db, 'users', userId)
  const userSnap = await getDoc(userRef)
  if (!userSnap.exists()) {
    throw new Error('User profile not found.')
  }

  const rawIds = userSnap.data().groupIds
  const groupIds = Array.isArray(rawIds) ? rawIds.filter((id) => typeof id === 'string' && id) : []

  const memberRefsToUpdate = []
  for (const groupId of groupIds) {
    const groupRef = doc(db, 'groups', groupId)
    const memberRef = doc(db, `groups/${groupId}/members/${userId}`)
    const [groupSnap, memberSnap] = await Promise.all([getDoc(groupRef), getDoc(memberRef)])
    if (!groupSnap.exists() || !memberSnap.exists()) continue
    const memberIds = groupSnap.data().memberIds || []
    if (!memberIds.includes(userId)) continue
    memberRefsToUpdate.push(memberRef)
  }

  const updates = [{ ref: userRef, data: { avatarUrl: newAvatarUrl } }, ...memberRefsToUpdate.map((ref) => ({ ref, data: { avatarUrl: newAvatarUrl } }))]

  for (let i = 0; i < updates.length; i += MAX_BATCH_OPS) {
    const batch = writeBatch(db)
    for (const u of updates.slice(i, i + MAX_BATCH_OPS)) {
      batch.update(u.ref, u.data)
    }
    await batch.commit()
  }

  return { avatarUrl: newAvatarUrl }
}
