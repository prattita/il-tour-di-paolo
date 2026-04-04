import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { normalizeCompoundTargetInput } from '../lib/compoundTask'
import { getFirebaseDb } from '../lib/firebase'
import { getUserAvatarUrlForMember } from './userService'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

function normalizeInviteCode(value) {
  return value.trim().toUpperCase()
}

function randomInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 8; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

export async function generateUniqueInviteCode() {
  const db = requireDb()
  for (let attempts = 0; attempts < 12; attempts += 1) {
    const code = randomInviteCode()
    const inviteSnap = await getDoc(doc(db, 'invites', code))
    if (!inviteSnap.exists()) return code
  }
  throw new Error('Unable to generate unique invite code. Please try again.')
}

const TASK_IDS = ['task-1', 'task-2', 'task-3']

function buildTaskPayload(raw, index) {
  const id = TASK_IDS[index]
  if (typeof raw === 'string') {
    const name = raw.trim() || `Task ${index + 1}`
    return { id, name, description: null, kind: 'simple', targetCount: null }
  }
  const name = (raw?.name || '').trim() || `Task ${index + 1}`
  const description =
    typeof raw?.description === 'string' && raw.description.trim() ? raw.description.trim() : null
  const kind = raw?.kind === 'compound' ? 'compound' : 'simple'
  let targetCount = null
  if (kind === 'compound') {
    targetCount = normalizeCompoundTargetInput(raw?.targetCount)
  }
  return { id, name, description, kind, targetCount }
}

/** New activity document (3 tasks, fixed medal copy). `sortOrder` controls list ordering. */
export function buildActivityDocument(input, sortOrder) {
  const isAdvanced = input.isAdvanced === true
  const isPersonal = input.isPersonal === true
  if (isAdvanced && isPersonal) {
    throw new Error('An activity cannot be both advanced and personal.')
  }
  const prereq =
    typeof input.prerequisiteActivityId === 'string' && input.prerequisiteActivityId.length > 0
      ? input.prerequisiteActivityId
      : null
  if (isAdvanced && !prereq) {
    throw new Error('Advanced activities require a prerequisite activity.')
  }
  let assignedUserId = null
  if (isPersonal) {
    const raw =
      typeof input.assignedUserId === 'string' && input.assignedUserId.trim()
        ? input.assignedUserId.trim()
        : null
    if (!raw) {
      throw new Error('Personal activities require an assigned member.')
    }
    assignedUserId = raw
  }
  const taskPayloads = [0, 1, 2].map((i) => buildTaskPayload(input.tasks?.[i], i))
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    tasks: taskPayloads,
    medalConditions: {
      bronze: 'Complete 1 of 3 tasks',
      silver: 'Complete 2 of 3 tasks',
      gold: 'Complete 3 of 3 tasks',
    },
    sortOrder,
    isLocked: false,
    isAdvanced,
    prerequisiteActivityId: isAdvanced ? prereq : null,
    isPersonal,
    assignedUserId: isPersonal ? assignedUserId : null,
    createdAt: serverTimestamp(),
  }
}

export async function createGroup({
  ownerId,
  ownerDisplayName,
  ownerAvatarUrl = null,
  name,
  description = '',
  activities = [],
}) {
  const db = requireDb()
  const groupName = name.trim()
  if (!groupName) {
    throw new Error('Group name is required.')
  }

  const validActivities = activities
    .filter((activity) => activity.name?.trim())
    .map((activity, index) => {
      const input = { ...activity }
      if (input.isPersonal === true && !input.assignedUserId) {
        input.assignedUserId = ownerId
      }
      return buildActivityDocument(input, index)
    })

  const memberAvatarUrl = await getUserAvatarUrlForMember(ownerId, ownerAvatarUrl)

  const inviteCode = await generateUniqueInviteCode()
  const groupRef = doc(collection(db, 'groups'))
  const memberRef = doc(db, `groups/${groupRef.id}/members/${ownerId}`)
  const inviteRef = doc(db, 'invites', inviteCode)
  const userRef = doc(db, 'users', ownerId)

  // Step 1: create group + link user groupIds.
  // Existing Firestore rules expect the group document to already exist
  // before writes to members/invites/activities are evaluated.
  const setupBatch = writeBatch(db)
  setupBatch.set(groupRef, {
    name: groupName,
    description: description.trim() || null,
    ownerId,
    inviteCode,
    memberIds: [ownerId],
    activityCount: validActivities.length,
    createdAt: serverTimestamp(),
  })
  setupBatch.update(userRef, { groupIds: arrayUnion(groupRef.id) })
  await setupBatch.commit()

  // Step 2: now that group exists, write subcollections and invite doc.
  const contentBatch = writeBatch(db)
  contentBatch.set(memberRef, {
    displayName: ownerDisplayName,
    avatarUrl: memberAvatarUrl,
    joinedAt: serverTimestamp(),
    selectedActivityIds: null,
    progress: {},
  })
  contentBatch.set(inviteRef, {
    groupId: groupRef.id,
    createdBy: ownerId,
    createdAt: serverTimestamp(),
    expiresAt: null,
  })
  for (let i = 0; i < validActivities.length; i += 1) {
    // Firestore-generated doc ids are the stable activity ids.
    const activityRef = doc(collection(db, `groups/${groupRef.id}/activities`))
    contentBatch.set(activityRef, validActivities[i])
  }
  await contentBatch.commit()

  return { groupId: groupRef.id, inviteCode }
}

export async function joinGroupByInviteCode({
  inviteCode,
  userId,
  userDisplayName,
  userAvatarUrl = null,
}) {
  const db = requireDb()
  const normalizedCode = normalizeInviteCode(inviteCode)
  if (!normalizedCode) {
    throw new Error('Invite code is required.')
  }

  const inviteRef = doc(db, 'invites', normalizedCode)
  const inviteSnap = await getDoc(inviteRef)
  if (!inviteSnap.exists()) {
    throw new Error('Invite code not found.')
  }

  const { groupId } = inviteSnap.data()
  const groupRef = doc(db, 'groups', groupId)
  const groupSnap = await getDoc(groupRef)
  if (!groupSnap.exists()) {
    throw new Error('This invite points to a missing group.')
  }

  const memberIds = groupSnap.data().memberIds || []
  if (memberIds.includes(userId)) {
    return { groupId, alreadyMember: true }
  }

  const memberAvatarUrl = await getUserAvatarUrlForMember(userId, userAvatarUrl)

  const memberRef = doc(db, `groups/${groupId}/members/${userId}`)
  const userRef = doc(db, 'users', userId)

  // Keep batch order aligned with rules: group.memberIds -> members doc -> user.groupIds.
  // `set(..., { merge: true })` so join still works if `users/{uid}` is not created yet (race with ensureUserProfile).
  const batch = writeBatch(db)
  batch.update(groupRef, { memberIds: arrayUnion(userId) })
  batch.set(memberRef, {
    displayName: userDisplayName,
    avatarUrl: memberAvatarUrl,
    joinedAt: serverTimestamp(),
    selectedActivityIds: null,
    progress: {},
  })
  batch.set(userRef, { groupIds: arrayUnion(groupId) }, { merge: true })
  await batch.commit()

  return { groupId, alreadyMember: false }
}

export async function getGroup(groupId) {
  const db = requireDb()
  const snap = await getDoc(doc(db, 'groups', groupId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export async function getGroupsByIds(groupIds) {
  const uniqueIds = [...new Set(groupIds.filter(Boolean))]
  const results = await Promise.all(
    uniqueIds.map(async (groupId) => {
      try {
        return await getGroup(groupId)
      } catch (e) {
        if (e?.code === 'permission-denied') return null
        throw e
      }
    }),
  )
  return results.filter(Boolean)
}
