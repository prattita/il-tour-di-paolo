import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { UserTracker } from '../components/UserTracker'
import { PageLoading } from '../components/PageLoading'
import { subscribeActivities, subscribeGroupMembers } from '../services/activityService'
import { getGroup } from '../services/groupService'
import { rankMembersForStandings } from '../lib/standingsRank'

export function GroupStandingsPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [activities, setActivities] = useState([])
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
    const unsubA = subscribeActivities(
      groupId,
      (list) => setActivities(list),
      (e) => setListError(e.message || 'Failed to load activities.'),
    )
    return () => {
      unsubM()
      unsubA()
    }
  }, [groupId, isMember])

  const ranked = useMemo(
    () => rankMembersForStandings(members, activities),
    [members, activities],
  )

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
                    activities={activities}
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
