import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import {
  getCompoundTarget,
  isCompoundTask,
  normalizeCompoundTargetInput,
} from '../lib/compoundTask'
import { getFirebaseDb } from '../lib/firebase'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
}

/** Avoid Firestore composite index (`isAdvanced` + `sortOrder`) — family-scale list size. */
function sortActivitiesBySortOrderThenName(list) {
  return [...list].sort((a, b) => {
    const sa = Number(a.sortOrder) || 0
    const sb = Number(b.sortOrder) || 0
    if (sa !== sb) return sa - sb
    return (a.name || '').localeCompare(b.name || '')
  })
}

/**
 * Activities for a group, sorted by `sortOrder` then name.
 */
export async function listActivities(groupId) {
  const db = requireDb()
  const q = query(collection(db, `groups/${groupId}/activities`), orderBy('sortOrder', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Subscribe to activities (real-time).
 */
export function subscribeActivities(groupId, onData, onError) {
  const db = requireDb()
  const q = query(collection(db, `groups/${groupId}/activities`), orderBy('sortOrder', 'asc'))
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    onError,
  )
}

/**
 * Activities visible to a non-owner member: standard (`isAdvanced == false`) plus enrolled advanced
 * docs (real-time). Does not query the full collection (rules would reject unreadable advanced rows).
 *
 * @param {string} groupId
 * @param {string} memberUserId — whose enrollment + activity visibility (profile subject or current user)
 */
export function subscribeMemberVisibleActivities(groupId, memberUserId, onData, onError) {
  const db = requireDb()
  let standardActs = []
  const advancedById = new Map()
  let enrolledIds = []
  const advancedUnsubs = []

  function sortMerged(list) {
    return [...list].sort((a, b) => {
      const sa = Number(a.sortOrder) || 0
      const sb = Number(b.sortOrder) || 0
      if (sa !== sb) return sa - sb
      return (a.name || '').localeCompare(b.name || '')
    })
  }

  function emit() {
    const advancedList = enrolledIds.map((id) => advancedById.get(id)).filter(Boolean)
    onData(sortMerged([...standardActs, ...advancedList]))
  }

  function refreshAdvancedListeners() {
    for (const u of advancedUnsubs) u()
    advancedUnsubs.length = 0
    advancedById.clear()
    for (const aid of enrolledIds) {
      const aref = doc(db, `groups/${groupId}/activities`, aid)
      const unsub = onSnapshot(
        aref,
        (s) => {
          if (s.exists()) advancedById.set(aid, { id: s.id, ...s.data() })
          else advancedById.delete(aid)
          emit()
        },
        onError,
      )
      advancedUnsubs.push(unsub)
    }
  }

  const qStd = query(collection(db, `groups/${groupId}/activities`), where('isAdvanced', '==', false))

  const unsubStd = onSnapshot(
    qStd,
    (snap) => {
      standardActs = sortActivitiesBySortOrderThenName(
        snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      )
      emit()
    },
    onError,
  )

  const enrRef = doc(db, `groups/${groupId}/enrollments`, memberUserId)
  const unsubEnr = onSnapshot(
    enrRef,
    (snap) => {
      enrolledIds = snap.exists() ? [...(snap.data().enrolledActivityIds || [])] : []
      refreshAdvancedListeners()
      emit()
    },
    onError,
  )

  return () => {
    unsubStd()
    unsubEnr()
    for (const u of advancedUnsubs) u()
  }
}

/**
 * Owner sees all activities; everyone else sees {@link subscribeMemberVisibleActivities} for themselves.
 */
export function subscribeActivitiesForViewer(groupId, viewerUid, groupOwnerId, onData, onError) {
  return subscribeActivitiesForScope(
    groupId,
    viewerUid,
    viewerUid,
    groupOwnerId,
    onData,
    onError,
  )
}

/**
 * Profile always uses the subject member's visible set (standard + enrolled advanced),
 * including when the subject is the owner.
 */
export function subscribeActivitiesForProfile(
  groupId,
  profileUserId,
  viewerUid,
  groupOwnerId,
  onData,
  onError,
) {
  return subscribeMemberVisibleActivities(groupId, profileUserId, onData, onError)
}

/**
 * Shared activity visibility for UI scopes.
 * - Group owner viewing their own scope sees all activities.
 * - Everyone else sees member-visible activities for `subjectUserId`.
 */
function subscribeActivitiesForScope(
  groupId,
  subjectUserId,
  viewerUid,
  groupOwnerId,
  onData,
  onError,
) {
  const ownerViewingOwnScope = Boolean(
    viewerUid && groupOwnerId && viewerUid === groupOwnerId && subjectUserId === viewerUid,
  )
  if (ownerViewingOwnScope) return subscribeActivities(groupId, onData, onError)
  return subscribeMemberVisibleActivities(groupId, subjectUserId, onData, onError)
}

/** Standard activities only (`isAdvanced == false`). */
export function subscribeStandardActivitiesOnly(groupId, onData, onError) {
  const db = requireDb()
  const qStd = query(collection(db, `groups/${groupId}/activities`), where('isAdvanced', '==', false))
  return onSnapshot(
    qStd,
    (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) => a.isPersonal !== true)
      onData(sortActivitiesBySortOrderThenName(list))
    },
    onError,
  )
}

/**
 * Non-advanced activities: **standard + personal** (Firestore rules still filter per reader).
 * Use for standings so each member’s Y includes personal activities assigned to them.
 */
export function subscribeNonAdvancedActivitiesForStandings(groupId, onData, onError) {
  const db = requireDb()
  const qStd = query(collection(db, `groups/${groupId}/activities`), where('isAdvanced', '==', false))
  return onSnapshot(
    qStd,
    (snap) => {
      onData(
        sortActivitiesBySortOrderThenName(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ),
      )
    },
    onError,
  )
}

export function subscribeEnrollmentActivityIds(groupId, userId, onData, onError) {
  const db = requireDb()
  const ref = doc(db, `groups/${groupId}/enrollments`, userId)
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? [...(snap.data().enrolledActivityIds || [])] : [])
    },
    onError,
  )
}

/**
 * Advanced activities the member is currently eligible to join (gold prerequisite reached),
 * excluding already-enrolled activities.
 */
export function subscribeEligibleAdvancedActivities(groupId, userId, onData, onError) {
  const db = requireDb()
  const candidatesById = new Map()
  const candidateUnsubs = []
  let enrolledIds = []
  let goldPrereqIds = []

  function emit() {
    const enrolled = new Set(enrolledIds)
    const list = [...candidatesById.values()].filter((a) => !enrolled.has(a.id))
    onData(sortActivitiesBySortOrderThenName(list))
  }

  function refreshCandidateQueries() {
    for (const u of candidateUnsubs) u()
    candidateUnsubs.length = 0
    candidatesById.clear()
    for (const prereqId of goldPrereqIds) {
      const q = query(
        collection(db, `groups/${groupId}/activities`),
        where('prerequisiteActivityId', '==', prereqId),
      )
      const unsub = onSnapshot(
        q,
        (snap) => {
          for (const d of snap.docs) {
            const data = d.data()
            if (data?.isAdvanced === true) {
              candidatesById.set(d.id, { id: d.id, ...data })
            }
          }
          emit()
        },
        onError,
      )
      candidateUnsubs.push(unsub)
    }
    emit()
  }

  const unsubEnrollment = subscribeEnrollmentActivityIds(
    groupId,
    userId,
    (ids) => {
      enrolledIds = [...ids]
      emit()
    },
    onError,
  )

  const unsubMember = subscribeGroupMember(
    groupId,
    userId,
    (member) => {
      const progress = member?.progress || {}
      goldPrereqIds = Object.entries(progress)
        .filter(([, p]) => Number(p?.tasksCompleted || 0) >= 3)
        .map(([activityId]) => activityId)
      refreshCandidateQueries()
    },
    onError,
  )

  return () => {
    unsubEnrollment()
    unsubMember()
    for (const u of candidateUnsubs) u()
  }
}

/** Explicit manual enrollment into an advanced activity; no unenroll path. */
export async function joinAdvancedActivity(groupId, userId, activityId) {
  const db = requireDb()
  const memberRef = doc(db, `groups/${groupId}/members/${userId}`)
  const activityRef = doc(db, `groups/${groupId}/activities/${activityId}`)
  const enrollmentRef = doc(db, `groups/${groupId}/enrollments/${userId}`)

  await runTransaction(db, async (tx) => {
    const [memberSnap, activitySnap] = await Promise.all([tx.get(memberRef), tx.get(activityRef)])
    if (!memberSnap.exists()) throw new Error('Member not found.')
    if (!activitySnap.exists()) throw new Error('Activity not found.')
    const activity = activitySnap.data() || {}
    if (activity.isAdvanced !== true) throw new Error('This activity is not advanced.')
    const prereqId =
      typeof activity.prerequisiteActivityId === 'string' ? activity.prerequisiteActivityId : ''
    if (!prereqId) throw new Error('This advanced activity is missing a prerequisite.')

    const tasksCompleted = Number(memberSnap.data()?.progress?.[prereqId]?.tasksCompleted || 0)
    if (tasksCompleted < 3) {
      throw new Error('You must earn Gold on the prerequisite activity first.')
    }

    tx.set(
      enrollmentRef,
      {
        userId,
        enrolledActivityIds: arrayUnion(activityId),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  })
}

/**
 * Profile / unlock UI: ordered rows — standard activities at top level, then nested enrolled advanced (supports chains).
 */
export function buildProfileActivityRows(activities) {
  const byId = new Map((activities || []).map((a) => [a.id, a]))
  const childMap = {}
  for (const a of activities || []) {
    if (a.isAdvanced !== true) continue
    if (!byId.has(a.id)) continue
    const pid = a.prerequisiteActivityId
    if (!pid || typeof pid !== 'string') continue
    if (!childMap[pid]) childMap[pid] = []
    childMap[pid].push(a)
  }
  for (const pid of Object.keys(childMap)) {
    childMap[pid].sort((x, y) => (Number(x.sortOrder) || 0) - (Number(y.sortOrder) || 0))
  }

  const rows = []
  function walkChildren(parentId, depth) {
    for (const child of childMap[parentId] || []) {
      rows.push({ activity: child, depth })
      walkChildren(child.id, depth + 1)
    }
  }

  const topLevel = (activities || [])
    .filter((a) => !a.isAdvanced)
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))

  for (const a of topLevel) {
    rows.push({ activity: a, depth: 0 })
    walkChildren(a.id, 1)
  }

  return rows
}

/**
 * Current user's member doc in the group (progress, displayName, etc.).
 */
export async function getGroupMember(groupId, userId) {
  const db = requireDb()
  const snap = await getDoc(doc(db, `groups/${groupId}/members/${userId}`))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export function subscribeGroupMember(groupId, userId, onData, onError) {
  const db = requireDb()
  const ref = doc(db, `groups/${groupId}/members/${userId}`)
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    },
    onError,
  )
}

export function subscribeGroupMembers(groupId, onData, onError) {
  const db = requireDb()
  return onSnapshot(
    collection(db, `groups/${groupId}/members`),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => {
        const na = (a.displayName || '').toLowerCase()
        const nb = (b.displayName || '').toLowerCase()
        if (na !== nb) return na.localeCompare(nb)
        return a.id.localeCompare(b.id)
      })
      onData(list)
    },
    onError,
  )
}

/** Enrollment snapshot for all group members: { [userId]: enrolledActivityIds[] }. */
export function subscribeGroupEnrollments(groupId, onData, onError) {
  const db = requireDb()
  return onSnapshot(
    collection(db, `groups/${groupId}/enrollments`),
    (snap) => {
      const byUserId = {}
      for (const d of snap.docs) {
        const data = d.data() || {}
        byUserId[d.id] = Array.isArray(data.enrolledActivityIds) ? [...data.enrolledActivityIds] : []
      }
      onData(byUserId)
    },
    onError,
  )
}

const TASK_IDS = ['task-1', 'task-2', 'task-3']

async function fetchPendingTaskIdsForActivity(db, groupId, activityId) {
  const q = query(
    collection(db, `groups/${groupId}/pending`),
    where('activityId', '==', activityId),
  )
  const snap = await getDocs(q)
  const ids = new Set()
  for (const d of snap.docs) {
    const tid = d.data()?.taskId
    if (typeof tid === 'string' && tid) ids.add(tid)
  }
  return ids
}

async function isTaskInPlayForCompoundEdit(db, groupId, activityId, taskId) {
  const mSnap = await getDocs(collection(db, `groups/${groupId}/members`))
  for (const d of mSnap.docs) {
    const data = d.data()
    const prog = data.progress?.[activityId]
    if (prog?.completedTaskIds?.includes(taskId)) return true
    const x = data.compoundProgress?.[activityId]?.[taskId]
    if (typeof x === 'number' && x > 0) return true
  }
  return false
}

async function activityHasAnyParticipation(db, groupId, activityId) {
  const pendingSnap = await getDocs(
    query(
      collection(db, `groups/${groupId}/pending`),
      where('activityId', '==', activityId),
    ),
  )
  if (pendingSnap.docs.length > 0) return true
  const mSnap = await getDocs(collection(db, `groups/${groupId}/members`))
  for (const d of mSnap.docs) {
    const data = d.data()
    const prog = data.progress?.[activityId]
    if (Number(prog?.tasksCompleted || 0) > 0) return true
    if (Array.isArray(prog?.completedTaskIds) && prog.completedTaskIds.length > 0) return true
    const cp = data.compoundProgress?.[activityId]
    if (cp && typeof cp === 'object') {
      for (const v of Object.values(cp)) {
        if (typeof v === 'number' && v > 0) return true
      }
    }
  }
  return false
}

/**
 * Member adjusts compound task counter (+1 / -1). Trust-based; bounded by activity `targetCount`.
 */
export async function adjustMemberCompoundCount(groupId, memberId, activityId, taskId, delta) {
  const db = requireDb()
  const step = delta > 0 ? 1 : delta < 0 ? -1 : 0
  if (step === 0) return
  const activityRef = doc(db, `groups/${groupId}/activities`, activityId)
  const memberRef = doc(db, `groups/${groupId}/members`, memberId)
  await runTransaction(db, async (transaction) => {
    const actSnap = await transaction.get(activityRef)
    const memSnap = await transaction.get(memberRef)
    if (!actSnap.exists() || !memSnap.exists()) throw new Error('Not found.')
    const tasks = actSnap.data().tasks || []
    const task = tasks.find((x) => x.id === taskId)
    if (!isCompoundTask(task)) throw new Error('This task does not use a counter.')
    const y = getCompoundTarget(task)
    const cpRoot = { ...(memSnap.data().compoundProgress || {}) }
    const inner = { ...(cpRoot[activityId] || {}) }
    const cur = typeof inner[taskId] === 'number' ? inner[taskId] : 0
    const next = Math.min(y, Math.max(0, cur + step))
    if (next === cur) return
    inner[taskId] = next
    cpRoot[activityId] = inner
    transaction.update(memberRef, { compoundProgress: cpRoot })
  })
}

/**
 * Owner-only: update activity name/description and task labels. Task ids and count stay fixed.
 * `isLocked` only blocks changing task structure; names remain editable per DESIGN §8.
 * Advanced flags (`isAdvanced`, `prerequisiteActivityId`) may change only while `isLocked == false`.
 * Compound `kind` / `targetCount` follow docs/phase-three/compoundTasks-onepager.md (middle-ground edit).
 */
export async function updateActivityDocument(
  groupId,
  activityId,
  {
    name,
    description,
    tasks,
    isAdvanced,
    prerequisiteActivityId,
    isPersonal,
    assignedUserId,
  } = {},
) {
  const db = requireDb()
  const ref = doc(db, `groups/${groupId}/activities`, activityId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Activity not found.')

  const groupSnap = await getDoc(doc(db, 'groups', groupId))
  const memberIds = groupSnap.exists() ? groupSnap.data().memberIds || [] : []

  const activityName = name?.trim()
  if (!activityName) throw new Error('Activity name is required.')

  if (!Array.isArray(tasks) || tasks.length !== 3) {
    throw new Error('Each activity must have exactly three tasks.')
  }

  const prevTasks = snap.data().tasks || []
  const nextTasks = [0, 1, 2].map((i) => {
    const id = prevTasks[i]?.id || TASK_IDS[i]
    const t = tasks[i]
    const taskName = (typeof t?.name === 'string' ? t.name : '').trim() || `Task ${i + 1}`
    const taskDescription =
      typeof t?.description === 'string' && t.description.trim() ? t.description.trim() : null
    const prev = prevTasks[i] || {}
    const kind = t?.kind === 'compound' ? 'compound' : 'simple'
    let targetCount = null
    if (kind === 'compound') {
      targetCount = normalizeCompoundTargetInput(t?.targetCount ?? prev.targetCount)
    }
    return { id, name: taskName, description: taskDescription, kind, targetCount }
  })

  const prevData = snap.data()
  const locked = prevData.isLocked === true
  const prevIsPersonal = prevData.isPersonal === true
  const prevAssigned =
    typeof prevData.assignedUserId === 'string' ? prevData.assignedUserId : null
  const pendingTaskIds = await fetchPendingTaskIdsForActivity(db, groupId, activityId)

  for (let i = 0; i < 3; i += 1) {
    const prevT = prevTasks[i] || {}
    const nextT = nextTasks[i]
    const prevKind = prevT.kind === 'compound' ? 'compound' : 'simple'
    const nextKind = nextT.kind
    const prevY = prevKind === 'compound' ? getCompoundTarget(prevT) : null
    const nextY = nextKind === 'compound' ? getCompoundTarget(nextT) : null
    const compoundMetaChanged = prevKind !== nextKind || prevY !== nextY

    if (!compoundMetaChanged) continue

    if (locked) {
      throw new Error(
        'Cannot change compound task settings after this activity has approved progress.',
      )
    }
    if (pendingTaskIds.has(nextT.id)) {
      throw new Error('Cannot change this task type while a submission is pending for it.')
    }
    if (await isTaskInPlayForCompoundEdit(db, groupId, activityId, nextT.id)) {
      throw new Error('Cannot change compound settings after members have started this task.')
    }
  }

  const patch = {
    name: activityName,
    description: description?.trim() || null,
    tasks: nextTasks,
  }

  const advProvided = isAdvanced !== undefined || prerequisiteActivityId !== undefined
  if (advProvided) {
    if (locked) {
      throw new Error('Cannot change advanced settings after this activity has approved progress.')
    }
    const nextIsAdvanced = isAdvanced === true
    if (nextIsAdvanced) {
      if (prevData.isPersonal === true) {
        throw new Error('Turn off personal before making this an advanced activity.')
      }
      const pid =
        typeof prerequisiteActivityId === 'string' ? prerequisiteActivityId.trim() : ''
      if (!pid) {
        throw new Error('Advanced activities require a prerequisite activity.')
      }
      if (pid === activityId) {
        throw new Error('An activity cannot be its own prerequisite.')
      }
      const prereqSnap = await getDoc(doc(db, `groups/${groupId}/activities`, pid))
      if (!prereqSnap.exists()) throw new Error('Prerequisite activity not found.')
      if (prereqSnap.data()?.isAdvanced === true) {
        throw new Error('Prerequisite must be a standard activity.')
      }
      if (prereqSnap.data()?.isPersonal === true) {
        throw new Error('Prerequisite cannot be a personal activity.')
      }
      patch.isAdvanced = true
      patch.prerequisiteActivityId = pid
    } else {
      patch.isAdvanced = false
      patch.prerequisiteActivityId = null
    }
  }

  const personalProvided = isPersonal !== undefined || assignedUserId !== undefined
  if (personalProvided) {
    const willBeAdvanced =
      patch.isAdvanced !== undefined ? patch.isAdvanced === true : prevData.isAdvanced === true
    const nextIsPersonalFlag =
      isPersonal !== undefined ? isPersonal === true : prevIsPersonal

    let nextAssignedResolved = prevAssigned
    if (assignedUserId !== undefined) {
      const raw = typeof assignedUserId === 'string' ? assignedUserId.trim() : ''
      nextAssignedResolved = raw || null
    }

    if (nextIsPersonalFlag && willBeAdvanced) {
      throw new Error('An activity cannot be both advanced and personal.')
    }

    if (nextIsPersonalFlag && nextIsPersonalFlag !== prevIsPersonal && locked) {
      throw new Error('Cannot change personal settings after this activity has approved progress.')
    }

    if (nextIsPersonalFlag && !nextAssignedResolved) {
      throw new Error('Personal activities require an assigned member.')
    }
    if (
      nextIsPersonalFlag &&
      nextAssignedResolved &&
      !memberIds.includes(nextAssignedResolved)
    ) {
      throw new Error('Assignee must be a current group member.')
    }

    if (assignedUserId !== undefined && nextAssignedResolved !== prevAssigned) {
      const pickup = prevAssigned == null && nextAssignedResolved != null
      if (!pickup) {
        if (locked) {
          throw new Error('Cannot change assignee after this activity has approved progress.')
        }
        if (await activityHasAnyParticipation(db, groupId, activityId)) {
          throw new Error('Cannot change assignee after members have progress on this activity.')
        }
      }
    }

    if (isPersonal !== undefined) {
      if (nextIsPersonalFlag && prevData.isAdvanced === true && willBeAdvanced) {
        throw new Error('Turn off advanced before making this a personal activity.')
      }
      patch.isPersonal = nextIsPersonalFlag
      patch.assignedUserId = nextIsPersonalFlag ? nextAssignedResolved : null
    } else if (assignedUserId !== undefined && prevIsPersonal) {
      patch.assignedUserId = nextAssignedResolved
    }
  }

  const finalAdv =
    patch.isAdvanced !== undefined ? patch.isAdvanced === true : prevData.isAdvanced === true
  const finalPer =
    patch.isPersonal !== undefined ? patch.isPersonal === true : prevData.isPersonal === true
  if (finalPer && finalAdv) {
    throw new Error('An activity cannot be both advanced and personal.')
  }

  await updateDoc(ref, patch)
}
