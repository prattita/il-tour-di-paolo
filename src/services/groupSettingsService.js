import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { normalizeDocPhotos, pendingPhotoStoragePaths } from '../lib/feedPhotos'
import { getFirebaseDb } from '../lib/firebase'
import { buildActivityDocument, generateUniqueInviteCode, getGroup } from './groupService'
import { deleteSubmissionPhotosByPaths } from './storageService'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

const BATCH_LIMIT = 400

async function deleteDocumentRefsInChunks(db, refs) {
  const list = refs.filter(Boolean)
  for (let i = 0; i < list.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const r of list.slice(i, i + BATCH_LIMIT)) {
      batch.delete(r)
    }
    await batch.commit()
  }
}

/**
 * Owner-only: remove all Firestore data for this group (subcollections first; Firestore does not
 * cascade deletes). Deletes Storage objects for pending and feed photos, the invite doc, then the
 * group doc. Does not write other users' user documents; stale groupIds self-heal on home load
 * via pruneStaleGroupIdsFromUser.
 */
export async function deleteEntireGroup(groupId, ownerId) {
  const db = requireDb()
  const group = await getGroup(groupId)
  if (!group) throw new Error('Group not found.')
  if (group.ownerId !== ownerId) throw new Error('Only the owner can delete this group.')

  const pendingSnap = await getDocs(collection(db, `groups/${groupId}/pending`))
  for (const d of pendingSnap.docs) {
    await deleteSubmissionPhotosByPaths(pendingPhotoStoragePaths({ id: d.id, ...d.data() }))
  }
  await deleteDocumentRefsInChunks(
    db,
    pendingSnap.docs.map((d) => d.ref),
  )

  const feedSnap = await getDocs(collection(db, `groups/${groupId}/feed`))
  const commentRefs = []
  for (const feedDoc of feedSnap.docs) {
    const data = feedDoc.data()
    const paths = normalizeDocPhotos({ id: feedDoc.id, ...data })
      .map((p) => p.path)
      .filter((p) => typeof p === 'string' && p.length > 0)
    await deleteSubmissionPhotosByPaths(paths)

    const commentsSnap = await getDocs(
      collection(db, `groups/${groupId}/feed/${feedDoc.id}/comments`),
    )
    for (const c of commentsSnap.docs) {
      commentRefs.push(c.ref)
    }
  }
  await deleteDocumentRefsInChunks(db, commentRefs)
  await deleteDocumentRefsInChunks(
    db,
    feedSnap.docs.map((d) => d.ref),
  )

  const activitiesSnap = await getDocs(collection(db, `groups/${groupId}/activities`))
  await deleteDocumentRefsInChunks(
    db,
    activitiesSnap.docs.map((d) => d.ref),
  )

  const enrollSnap = await getDocs(collection(db, `groups/${groupId}/enrollments`))
  await deleteDocumentRefsInChunks(
    db,
    enrollSnap.docs.map((d) => d.ref),
  )

  const membersSnap = await getDocs(collection(db, `groups/${groupId}/members`))
  await deleteDocumentRefsInChunks(
    db,
    membersSnap.docs.map((d) => d.ref),
  )

  const code = typeof group.inviteCode === 'string' ? group.inviteCode.trim() : ''
  if (code) {
    const inviteRef = doc(db, 'invites', code)
    const invSnap = await getDoc(inviteRef)
    if (invSnap.exists() && invSnap.data()?.groupId === groupId) {
      await deleteDoc(inviteRef)
    }
  }

  try {
    await deleteDoc(doc(db, 'groups', groupId))
  } catch (e) {
    const code = e?.code || e?.name
    if (code === 'permission-denied') {
      throw new Error(
        'Could not remove the group record (permission denied). Deploy the latest firestore.rules to Firebase, then delete the empty group from the console if needed — or contact support.',
      )
    }
    throw e
  }
}

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
    await deleteSubmissionPhotosByPaths(pendingPhotoStoragePaths(p))
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

  const personalActsSnap = await getDocs(
    query(
      collection(db, `groups/${groupId}/activities`),
      where('assignedUserId', '==', memberUserId),
    ),
  )

  const enrollmentRef = doc(db, `groups/${groupId}/enrollments/${memberUserId}`)
  const batch = writeBatch(db)
  batch.delete(memberRef)
  batch.delete(enrollmentRef)
  batch.update(groupRef, { memberIds: arrayRemove(memberUserId) })
  for (const d of personalActsSnap.docs) {
    const data = d.data()
    if (data?.isPersonal === true) {
      batch.update(d.ref, { assignedUserId: null })
    }
  }
  await batch.commit()
}

/**
 * One-time idempotent repair: legacy activity docs missing `isAdvanced` / `prerequisiteActivityId`.
 * Owner-only; call from settings after deploy. Required for member `where('isAdvanced', '==', false)` queries.
 */
export async function ensureActivityAdvancedDefaults(groupId) {
  const db = requireDb()
  const snap = await getDocs(collection(db, `groups/${groupId}/activities`))
  let batch = writeBatch(db)
  let ops = 0
  for (const d of snap.docs) {
    const data = d.data()
    const patch = {}
    if (!('isAdvanced' in data)) patch.isAdvanced = false
    if (!('prerequisiteActivityId' in data)) patch.prerequisiteActivityId = null
    if (!('isPersonal' in data)) patch.isPersonal = false
    if (!('assignedUserId' in data)) patch.assignedUserId = null
    if (Object.keys(patch).length > 0) {
      batch.update(d.ref, patch)
      ops += 1
      if (ops >= BATCH_LIMIT) {
        await batch.commit()
        batch = writeBatch(db)
        ops = 0
      }
    }
  }
  if (ops > 0) await batch.commit()
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

  if (activityInput.isPersonal === true) {
    const aid =
      typeof activityInput.assignedUserId === 'string' ? activityInput.assignedUserId.trim() : ''
    if (!aid || !(group.memberIds || []).includes(aid)) {
      throw new Error('Choose a group member to assign this personal activity.')
    }
  }
  if (activityInput.isAdvanced === true) {
    const pid = activityInput.prerequisiteActivityId?.trim()
    if (!pid) {
      throw new Error('Choose a standard activity as the prerequisite for this advanced activity.')
    }
    const prereqSnap = await getDoc(doc(db, `groups/${groupId}/activities`, pid))
    if (!prereqSnap.exists()) {
      throw new Error('Prerequisite activity not found.')
    }
    if (prereqSnap.data()?.isAdvanced === true) {
      throw new Error('Prerequisite must be a standard activity.')
    }
    if (prereqSnap.data()?.isPersonal === true) {
      throw new Error('Prerequisite cannot be a personal activity.')
    }
  }

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
    systemKind: 'activity_added',
    systemActorDisplayName: who,
    systemActivityName: name,
    message: `${who} added a new activity: ${name}`,
    timestamp: serverTimestamp(),
    commentCount: 0,
    likes: [],
  })
  await batch.commit()
  return { activityId: activityRef.id }
}
