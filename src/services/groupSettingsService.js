import {
  arrayRemove,
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'
import { buildActivityDocument, generateUniqueInviteCode, getGroup } from './groupService'
import { deleteSubmissionPhotoByPath } from './storageService'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

const BATCH_LIMIT = 400

export async function updateGroupDetails(groupId, { name, description }) {
  const db = requireDb()
  const groupName = name?.trim()
  if (!groupName) {
    throw new Error('Group name is required.')
  }
  const groupRef = doc(db, 'groups', groupId)
  await updateDoc(groupRef, {
    name: groupName,
    description: description?.trim() || null,
  })
}

/**
 * Deletes old invite doc, creates new, updates group. Old links stop working immediately.
 */
export async function regenerateGroupInviteCode(groupId) {
  const db = requireDb()
  const group = await getGroup(groupId)
  if (!group) throw new Error('Group not found.')
  const oldCode = group.inviteCode
  if (!oldCode) throw new Error('Group has no invite code.')

  const newCode = await generateUniqueInviteCode()
  const groupRef = doc(db, 'groups', groupId)
  const oldInviteRef = doc(db, 'invites', oldCode)
  const newInviteRef = doc(db, 'invites', newCode)

  const batch = writeBatch(db)
  batch.delete(oldInviteRef)
  batch.set(newInviteRef, {
    groupId,
    createdBy: group.ownerId,
    createdAt: serverTimestamp(),
    expiresAt: null,
  })
  batch.update(groupRef, { inviteCode: newCode })
  await batch.commit()
  return { inviteCode: newCode }
}

/**
 * Owner-only: remove pendings + storage, member doc, group.memberIds.
 * Does not update the removed user's `users/{uid}.groupIds` — Firestore rules block cross-user
 * user doc writes; they self-heal on next home load via `pruneStaleGroupIdsFromUser`.
 */
export async function removeGroupMember(groupId, memberUserId, ownerId) {
  const db = requireDb()
  const group = await getGroup(groupId)
  if (!group) throw new Error('Group not found.')
  if (group.ownerId !== ownerId) throw new Error('Only the owner can remove a member.')
  if (memberUserId === ownerId) throw new Error('You cannot remove yourself as owner.')
  const memberIds = group.memberIds || []
  if (!memberIds.includes(memberUserId)) throw new Error('That user is not in this group.')

  const pendingsSnap = await getDocs(
    query(collection(db, `groups/${groupId}/pending`), where('userId', '==', memberUserId)),
  )
  const pendings = pendingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  for (const p of pendings) {
    const fallbackPath = `images/${p.id}/photo`
    await deleteSubmissionPhotoByPath(p.imagePath || fallbackPath)
  }

  for (let i = 0; i < pendings.length; i += BATCH_LIMIT) {
    const chunk = pendings.slice(i, i + BATCH_LIMIT)
    const batch = writeBatch(db)
    for (const p of chunk) {
      batch.delete(doc(db, `groups/${groupId}/pending/${p.id}`))
    }
    await batch.commit()
  }

  const memberRef = doc(db, `groups/${groupId}/members/${memberUserId}`)
  const groupRef = doc(db, 'groups', groupId)

  const batch = writeBatch(db)
  batch.delete(memberRef)
  batch.update(groupRef, { memberIds: arrayRemove(memberUserId) })
  await batch.commit()
}

/**
 * Create a new activity, bump activityCount, system feed line.
 */
export async function addGroupActivity(groupId, activityInput, ownerDisplayName) {
  const db = requireDb()
  const group = await getGroup(groupId)
  if (!group) throw new Error('Group not found.')

  const name = activityInput.name?.trim()
  if (!name) throw new Error('Activity name is required.')

  const count = typeof group.activityCount === 'number' ? group.activityCount : 0
  if (count >= 10) {
    throw new Error('This group already has many activities (~10). Add only if you really need another.')
  }

  const sortOrder = count
  const activityPayload = buildActivityDocument(activityInput, sortOrder)
  const activityRef = doc(collection(db, `groups/${groupId}/activities`))
  const groupRef = doc(db, 'groups', groupId)

  const batch = writeBatch(db)
  batch.set(activityRef, activityPayload)
  batch.update(groupRef, { activityCount: increment(1) })
  const feedRef = doc(collection(db, `groups/${groupId}/feed`))
  const who = (ownerDisplayName || 'Owner').trim() || 'Owner'
  batch.set(feedRef, {
    type: 'system',
    message: `${who} added a new activity: ${name}`,
    timestamp: serverTimestamp(),
  })
  await batch.commit()
  return { activityId: activityRef.id }
}
