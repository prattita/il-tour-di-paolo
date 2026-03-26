import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore'
import { getFirebaseDb } from '../lib/firebase'

function requireDb() {
  const db = getFirebaseDb()
  if (!db) {
    throw new Error('Firestore is not available. Check Firebase configuration.')
  }
  return db
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

const TASK_IDS = ['task-1', 'task-2', 'task-3']

/**
 * Owner-only: update activity name/description and task labels. Task ids and count stay fixed.
 * `isLocked` only blocks changing task structure; names remain editable per DESIGN §8.
 */
export async function updateActivityDocument(groupId, activityId, { name, description, tasks }) {
  const db = requireDb()
  const ref = doc(db, `groups/${groupId}/activities`, activityId)
  const snap = await getDoc(ref)
  if (!snap.exists()) throw new Error('Activity not found.')

  const activityName = name?.trim()
  if (!activityName) throw new Error('Activity name is required.')

  if (!Array.isArray(tasks) || tasks.length !== 3) {
    throw new Error('Each activity must have exactly three tasks.')
  }

  const nextTasks = TASK_IDS.map((id, i) => {
    const t = tasks[i]
    const taskName = (typeof t?.name === 'string' ? t.name : '').trim() || `Task ${i + 1}`
    const taskDescription =
      typeof t?.description === 'string' && t.description.trim() ? t.description.trim() : null
    return { id, name: taskName, description: taskDescription }
  })

  await updateDoc(ref, {
    name: activityName,
    description: description?.trim() || null,
    tasks: nextTasks,
  })
}
