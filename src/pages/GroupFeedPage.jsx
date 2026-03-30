import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { MedalBadge } from '../components/MedalBadge'
import { subscribeGroupFeed } from '../services/feedService'
import { getGroup } from '../services/groupService'
import { PageLoading } from '../components/PageLoading'

/** Mock v1.0 Page 3 — avatar tints (see UI_MOCKUPS_v1.0.html `.av-*`). */
const FEED_AVATAR_PALETTE = [
  { bg: 'bg-[#B5D4F4]', text: 'text-[#0C447C]' },
  { bg: 'bg-[#9FE1CB]', text: 'text-[#085041]' },
  { bg: 'bg-[#CECBF6]', text: 'text-[#26215C]' },
  { bg: 'bg-[#F5C4B3]', text: 'text-[#4A1B0C]' },
]

function hashString(s) {
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function feedInitials(displayName) {
  const name = displayName?.trim()
  if (!name) return '??'
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function FeedAvatar({ displayName, seed }) {
  const initials = feedInitials(displayName)
  const palette = FEED_AVATAR_PALETTE[hashString(seed || displayName || 'x') % FEED_AVATAR_PALETTE.length]
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium ${palette.bg} ${palette.text}`}
      aria-hidden
    >
      {initials}
    </div>
  )
}

/** Closer to mock “2 hours ago” / “Yesterday” than full locale string. */
function formatFeedTime(value) {
  if (!value) return ''
  const d = typeof value.toDate === 'function' ? value.toDate() : value
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''

  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 0) {
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.floor((startOf(new Date(now)) - startOf(d)) / 86_400_000)
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'short' })
  }

  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
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

      <div className="flex flex-col gap-2">
        {posts.map((post) => {
          if (post.type === 'system') {
            return (
              <article
                key={post.id}
                className="rounded-lg border border-black/10 bg-tour-muted px-3 py-2 text-center text-[12px] leading-snug text-tour-text-secondary"
              >
                {post.message || 'Update'}
              </article>
            )
          }

          const headerBody = (
            <>
              <FeedAvatar displayName={post.displayName} seed={post.userId} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-tour-text">
                  {post.displayName || 'Member'}
                </p>
                <p className="text-[11px] text-tour-text-secondary">
                  {formatFeedTime(post.timestamp)}
                </p>
              </div>
              {post.type === 'task_completion' && (
                <MedalBadge tier={medalTierForPost(post.medal)} className="shrink-0" />
              )}
            </>
          )
          const rowClass = 'flex items-center gap-2 px-3 py-2.5'
          const header = post.userId ? (
            <Link
              to={`/group/${groupId}/profile/${post.userId}`}
              className={`${rowClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent focus-visible:ring-inset`}
            >
              {headerBody}
            </Link>
          ) : (
            <div className={rowClass}>{headerBody}</div>
          )

          return (
            <article
              key={post.id}
              className="overflow-hidden rounded-xl border border-black/10 bg-tour-surface"
            >
              {header}

              {post.imageUrl ? (
                <div className="relative h-[400px] w-full overflow-hidden bg-[#EAF3DE] sm:h-[600px]">
                  <img
                    src={post.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-[400px] w-full items-center justify-center bg-[#EAF3DE] sm:h-[600px]">
                  <span className="text-[11px] text-[#3B6D11]">Photo</span>
                </div>
              )}

              <div className="px-3 py-2.5">
                <p className="mb-1 text-[13px] text-tour-text">
                  Completed &quot;{post.taskName || 'Task'}&quot; in {post.activityName || 'Activity'}
                </p>
                {post.description ? (
                  <p className="text-[12px] leading-snug text-tour-text-secondary">{post.description}</p>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
