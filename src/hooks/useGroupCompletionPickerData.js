import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from './useTranslation'
import { getGroup } from '../services/groupService'
import { subscribeActivitiesForViewer, subscribeGroupMember } from '../services/activityService'
import { subscribePendingSubmission } from '../services/pendingService'

/**
 * Loads group membership, activities, current member doc, and per-activity pending snapshots
 * — same inputs as Activities / completion picker (DESIGN §7.4).
 */
export function useGroupCompletionPickerData(groupId, userId) {
  const { t } = useTranslation()
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
          setError(e.message || t('activities.loadGroupFailed'))
        }
      } finally {
        if (active) setLoadingGroup(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [groupId, t])

  useEffect(() => {
    if (!groupId || !isMember) {
      setActivitiesHydrated(false)
      return
    }
    setActivitiesHydrated(false)
    const unsub = subscribeActivitiesForViewer(
      groupId,
      userId,
      group?.ownerId,
      (list) => {
        setActivities(list)
        setActivitiesHydrated(true)
      },
      (e) => setError(e.message || t('activities.loadActivitiesFailed')),
    )
    return () => unsub()
  }, [groupId, isMember, userId, group?.ownerId, t])

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
      (e) => setError(e.message || t('activities.loadMemberFailed')),
    )
    return () => unsub()
  }, [groupId, userId, isMember, t])

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
