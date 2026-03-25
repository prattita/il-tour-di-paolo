import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { MedalBadge } from '../components/MedalBadge'
import { subscribeGroupFeed } from '../services/feedService'
import { getGroup } from '../services/groupService'

function formatFeedTime(value) {
  if (!value) return ''
  const d = typeof value.toDate === 'function' ? value.toDate() : value
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function medalTierForPost(medal) {
  if (medal === 'gold' || medal === 'silver' || medal === 'bronze') return medal
  return 'none'
}

export function GroupFeedPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [posts, setPosts] = useState([])
  const [feedError, setFeedError] = useState('')

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
    setFeedError('')
    const unsub = subscribeGroupFeed(
      groupId,
      (list) => setPosts(list),
      (e) => setFeedError(e.message || 'Could not load feed.'),
    )
    return () => unsub()
  }, [groupId, isMember])

  return (
    <div className="text-tour-text">
      <div className="mb-4 border-b border-black/10 pb-3 lg:hidden">
        <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
          Il Tour di Paolo 2026
        </p>
        <p className="text-[15px] font-medium text-tour-text">{group?.name || 'Group'}</p>
      </div>

      {loadingGroup && <p className="text-sm text-tour-text-secondary">Loading…</p>}

      {!loadingGroup && !group && (
        <p className="text-sm text-tour-text-secondary">Group not found.</p>
      )}

      {!loadingGroup && group && !isMember && (
        <p className="text-sm text-tour-text-secondary">You are not a member of this group.</p>
      )}

      {feedError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {feedError}
        </div>
      )}

      {!loadingGroup && isMember && !feedError && posts.length === 0 && (
        <p className="rounded-xl border border-black/10 bg-tour-surface p-4 text-sm text-tour-text-secondary">
          No posts yet. Approved task completions appear here.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {posts.map((post) => (
          <article
            key={post.id}
            className="overflow-hidden rounded-xl border border-black/10 bg-tour-surface"
          >
            {post.imageUrl && (
              <img
                src={post.imageUrl}
                alt=""
                className="aspect-[4/3] w-full object-cover"
              />
            )}
            <div className="space-y-2 px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-medium text-tour-text">
                    {post.displayName || 'Member'}
                  </p>
                  <p className="text-[12px] text-tour-text-secondary">
                    {post.activityName}
                    {' · '}
                    {post.taskName}
                  </p>
                </div>
                {post.type === 'task_completion' && (
                  <MedalBadge tier={medalTierForPost(post.medal)} />
                )}
              </div>
              {post.description && (
                <p className="text-[12px] text-tour-text-secondary">{post.description}</p>
              )}
              <p className="text-[11px] text-tour-text-secondary">{formatFeedTime(post.timestamp)}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
