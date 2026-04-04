import { collection, doc, getCountFromServer, getDoc } from 'firebase/firestore'

/**
 * Total pending submissions across groups where `uid` is the owner (approval queue size).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} uid
 * @returns {Promise<number>}
 */
export async function getOwnerPendingSubmissionCount(db, uid) {
  if (!db || !uid) return 0
  const userSnap = await getDoc(doc(db, 'users', uid))
  if (!userSnap.exists()) return 0
  const groupIds = userSnap.data().groupIds
  if (!Array.isArray(groupIds) || groupIds.length === 0) return 0

  let total = 0
  for (const gid of groupIds) {
    if (typeof gid !== 'string' || !gid) continue
    const gSnap = await getDoc(doc(db, 'groups', gid))
    if (!gSnap.exists()) continue
    if (gSnap.get('ownerId') !== uid) continue
    const agg = await getCountFromServer(collection(db, `groups/${gid}/pending`))
    total += agg.data().count
  }
  return total
}
