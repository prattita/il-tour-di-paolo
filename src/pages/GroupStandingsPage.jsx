import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { UserTracker } from '../components/UserTracker'
import { PageLoading } from '../components/PageLoading'
import {
  subscribeGroupEnrollments,
  subscribeGroupMembers,
  subscribeNonAdvancedActivitiesForStandings,
} from '../services/activityService'
import { getGroup } from '../services/groupService'
import { rankMembersForStandings } from '../lib/standingsRank'
import { inclusiveMedalCounts } from '../lib/medalTier'

export function GroupStandingsPage() {
  const { t } = useTranslation()
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
      (e) => setListError(e.message || t('standings.loadMembersFailed')),
    )
    const unsubA = subscribeNonAdvancedActivitiesForStandings(
      groupId,
      (list) => setActivities(list),
      (e) => setListError(e.message || t('standings.loadActivitiesFailed')),
    )
    const unsubE = subscribeGroupEnrollments(
      groupId,
      (byUserId) => setEnrollmentsByUserId(byUserId),
      (e) => setListError(e.message || t('standings.loadEnrollmentsFailed')),
    )
    return () => {
      unsubM()
      unsubA()
      unsubE()
    }
  }, [groupId, isMember, t])

  const perMemberSummary = useMemo(() => {
    const sharedStandardIds = activities
      .filter((a) => a.isPersonal !== true)
      .map((a) => a.id)
    const out = {}
    for (const m of members) {
      const personalIds = activities
        .filter(
          (a) =>
            a.isPersonal === true &&
            typeof a.assignedUserId === 'string' &&
            a.assignedUserId === m.id,
        )
        .map((a) => a.id)
      const enrolled = enrollmentsByUserId[m.id] || []
      const visibleIds = [...new Set([...sharedStandardIds, ...personalIds, ...enrolled])]
      const pseudoActivities = visibleIds.map((id) => ({ id }))
      out[m.id] = {
        total: pseudoActivities.length,
        counts: inclusiveMedalCounts(pseudoActivities, m.progress),
        activities: pseudoActivities,
      }
    }
    return out
  }, [members, activities, enrollmentsByUserId])

  /** Non-personal activities everyone shares (subtitle only; personal adds per assignee). */
  const sharedStandardActivityCount = useMemo(
    () => activities.filter((a) => a.isPersonal !== true).length,
    [activities],
  )

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
          {t('common.brandLine')}
        </p>
        <p className="text-[15px] font-medium text-tour-text">
          {group?.name || t('groupShell.titleGroup')}
        </p>
      </div>

      {loadingGroup && <PageLoading />}

      {!loadingGroup && !group && (
        <p className="text-sm text-tour-text-secondary">{t('feed.groupNotFound')}</p>
      )}

      {!loadingGroup && group && !isMember && (
        <p className="text-sm text-tour-text-secondary">{t('feed.notMember')}</p>
      )}

      {listError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {listError}
        </div>
      )}

      {!loadingGroup && isMember && !listError && (
        <>
          <p className="mb-4 text-[13px] text-tour-text-secondary">
            {t(
              members.length === 1 ? 'standings.memberCount_one' : 'standings.memberCount_other',
              { count: members.length },
            )}
            {' · '}
            {t(
              sharedStandardActivityCount === 1
                ? 'standings.activityCount_one'
                : 'standings.activityCount_other',
              { count: sharedStandardActivityCount },
            )}
          </p>
          {ranked.length === 0 ? (
            <p className="text-sm text-tour-text-secondary">{t('standings.noMembersToShow')}</p>
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
