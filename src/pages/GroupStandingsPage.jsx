import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { UserTracker } from '../components/UserTracker'
import { PageLoading } from '../components/PageLoading'
import {
  subscribeGroupEnrollments,
  subscribeGroupMembers,
  subscribeStandardActivitiesOnly,
} from '../services/activityService'
import { getGroup } from '../services/groupService'
import { rankMembersForStandings } from '../lib/standingsRank'
import { inclusiveMedalCounts } from '../lib/medalTier'

export function GroupStandingsPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [activities, setActivities] = useState([])
  const [enrollmentsByUserId, setEnrollmentsByUserId] = useState({})
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [listError, setListError] = useState('')

  useEffect(() => {
    let active = true
    async function run() {
      if (!groupId) return
      setLoadingGroup(true)
      try {
        const g = await getGroup(groupId)
        if (active) setGroup(g)
      } catch {
        if (active) setGroup(null)
      } finally {
        if (active) setLoadingGroup(false)
      }
    }
    run()
    return () => {
      active = false
    }
  }, [groupId])

  const isMember = Boolean(user?.uid && group?.memberIds?.includes(user.uid))

  useEffect(() => {
    if (!groupId || !isMember) return
    setListError('')
    const unsubM = subscribeGroupMembers(
      groupId,
      (list) => setMembers(list),
      (e) => setListError(e.message || 'Failed to load members.'),
    )
    const unsubA = subscribeStandardActivitiesOnly(
      groupId,
      (list) => setActivities(list),
      (e) => setListError(e.message || 'Failed to load activities.'),
    )
    const unsubE = subscribeGroupEnrollments(
      groupId,
      (byUserId) => setEnrollmentsByUserId(byUserId),
      (e) => setListError(e.message || 'Failed to load enrollments.'),
    )
    return () => {
      unsubM()
      unsubA()
      unsubE()
    }
  }, [groupId, isMember])

  const perMemberSummary = useMemo(() => {
    const standardIds = activities.map((a) => a.id)
    const out = {}
    for (const m of members) {
      const enrolled = enrollmentsByUserId[m.id] || []
      const visibleIds = [...new Set([...standardIds, ...enrolled])]
      const pseudoActivities = visibleIds.map((id) => ({ id }))
      out[m.id] = {
        total: pseudoActivities.length,
        counts: inclusiveMedalCounts(pseudoActivities, m.progress),
        activities: pseudoActivities,
      }
    }
    return out
  }, [members, activities, enrollmentsByUserId])

  const ranked = useMemo(() => {
    const membersWithScope = members.map((m) => ({
      ...m,
      _visibleActivitiesForStandings: perMemberSummary[m.id]?.activities || [],
    }))
    return rankMembersForStandings(
      membersWithScope,
      null,
      (member) => member._visibleActivitiesForStandings || [],
    )
  }, [members, perMemberSummary])

  return (
    <div className="text-tour-text">
      <div className="mb-4 border-b border-black/10 pb-3 lg:hidden">
        <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
          Il Tour di Paolo
        </p>
        <p className="text-[15px] font-medium text-tour-text">{group?.name || 'Group'}</p>
      </div>

      {loadingGroup && <PageLoading />}

      {!loadingGroup && !group && (
        <p className="text-sm text-tour-text-secondary">Group not found.</p>
      )}

      {!loadingGroup && group && !isMember && (
        <p className="text-sm text-tour-text-secondary">You are not a member of this group.</p>
      )}

      {listError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {listError}
        </div>
      )}

      {!loadingGroup && isMember && !listError && (
        <>
          <p className="mb-4 text-[13px] text-tour-text-secondary">
            {members.length} member{members.length === 1 ? '' : 's'} · {activities.length} activit
            {activities.length === 1 ? 'y' : 'ies'}
          </p>
          {ranked.length === 0 ? (
            <p className="text-sm text-tour-text-secondary">No members to show.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ranked.map((m, i) => (
                <li key={m.id}>
                  <UserTracker
                    member={m}
                    rank={i + 1}
                    variant="full"
                    isCurrentUser={user?.uid === m.id}
                    activities={[]}
                    totalOverride={perMemberSummary[m.id]?.total ?? 0}
                    countsOverride={perMemberSummary[m.id]?.counts}
                    groupId={groupId}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
