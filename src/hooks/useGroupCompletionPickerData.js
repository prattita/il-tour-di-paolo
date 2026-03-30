import { useEffect, useMemo, useState } from 'react'
import { getGroup } from '../services/groupService'
import { subscribeActivities, subscribeGroupMember } from '../services/activityService'
import { subscribePendingSubmission } from '../services/pendingService'

/**
 * Loads group membership, activities, current member doc, and per-activity pending snapshots
 * — same inputs as Activities / completion picker (DESIGN §7.4).
 */
export function useGroupCompletionPickerData(groupId, userId) {
  const [group, setGroup] = useState(null)
  const [activities, setActivities] = useState([])
  const [member, setMember] = useState(null)
  const [pendingByActivityId, setPendingByActivityId] = useState({})
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [error, setError] = useState('')
  const [activitiesHydrated, setActivitiesHydrated] = useState(false)
  const [memberHydrated, setMemberHydrated] = useState(false)

  const isMember = Boolean(userId && group?.memberIds?.includes(userId))

  /** First Firestore snapshots received for activities + member (avoids URL-lock flash). */
  const pickerDataReady =
    !loadingGroup && (!isMember || (activitiesHydrated && memberHydrated))

  useEffect(() => {
    let active = true
    async function run() {
      if (!groupId) return
      setLoadingGroup(true)
      setError('')
      try {
        const g = await getGroup(groupId)
        if (active) setGroup(g)
      } catch (e) {
        if (active) {
          setGroup(null)
          setError(e.message || 'Failed to load group.')
        }
      } finally {
        if (active) setLoadingGroup(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [groupId])

  useEffect(() => {
    if (!groupId || !isMember) {
      setActivitiesHydrated(false)
      return
    }
    setActivitiesHydrated(false)
    const unsub = subscribeActivities(
      groupId,
      (list) => {
        setActivities(list)
        setActivitiesHydrated(true)
      },
      (e) => setError(e.message || 'Activities listener failed.'),
    )
    return () => unsub()
  }, [groupId, isMember])

  useEffect(() => {
    if (!groupId || !userId || !isMember) {
      setMemberHydrated(false)
      return
    }
    setMemberHydrated(false)
    const unsub = subscribeGroupMember(
      groupId,
      userId,
      (m) => {
        setMember(m)
        setMemberHydrated(true)
      },
      (e) => setError(e.message || 'Member listener failed.'),
    )
    return () => unsub()
  }, [groupId, userId, isMember])

  const activityIdsKey = useMemo(() => activities.map((a) => a.id).sort().join(','), [activities])

  useEffect(() => {
    if (!groupId || !userId || !activityIdsKey) {
      return
    }
    const ids = activities.map((a) => a.id)
    const unsubs = ids.map((activityId) =>
      subscribePendingSubmission(
        groupId,
        userId,
        activityId,
        (data) =>
          setPendingByActivityId((prev) => ({
            ...prev,
            [activityId]: data,
          })),
        () => {},
      ),
    )
    return () => unsubs.forEach((u) => u())
  }, [groupId, userId, activityIdsKey, activities])

  return {
    loadingGroup,
    error,
    group,
    activities,
    member,
    pendingByActivityId,
    isMember,
    pickerDataReady,
  }
}
