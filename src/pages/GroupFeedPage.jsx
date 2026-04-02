import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { useGroupCompletionPickerData } from '../hooks/useGroupCompletionPickerData'
import { hasAnyEligibleCompletionActivity } from '../lib/completionEligibility'
import { docHasPhoto } from '../lib/feedPhotos'
import { FeedPostCard } from '../components/FeedPostCard'
import { PageLoading } from '../components/PageLoading'
import { Avatar } from '../components/Avatar'
import { subscribeGroupMembers } from '../services/activityService'
import {
  addFeedPostComment,
  deleteFeedPostComment,
  listFeedPostComments,
  setFeedPostLiked,
} from '../services/feedInteractionsService'
import {
  buildFeedSnapMap,
  FEED_PAGE_SIZE,
  fetchFeedOlderPage,
  getFeedPost,
  getOldestMergedFeedSnapshot,
  mergeFeedPosts,
  subscribeGroupFeedHead,
} from '../services/feedService'
import { getGroup } from '../services/groupService'

function systemFeedDisplayText(post, t) {
  if (
    post.systemKind === 'activity_added' &&
    typeof post.systemActivityName === 'string' &&
    post.systemActivityName.trim()
  ) {
    const actor = (post.systemActorDisplayName || '').trim() || t('groupShell.roleOwner')
    return t('feed.systemActivityAdded', { actor, activity: post.systemActivityName.trim() })
  }
  return post.message || t('feed.systemPostFallback')
}

function postMatchesFilters(post, userIds, activityIds) {
  if (post.type === 'system') {
    if (userIds.length > 0) return false
    if (activityIds.length > 0) return false
    return true
  }
  if (userIds.length > 0 && !userIds.includes(post.userId)) return false
  if (activityIds.length > 0 && !activityIds.includes(post.activityId)) return false
  return true
}

function ChevronDownIcon({ className }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function GroupFeedPage() {
  const { t } = useTranslation()
  const { groupId } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [loadingGroup, setLoadingGroup] = useState(true)
  const [feedError, setFeedError] = useState('')
  const [headSnaps, setHeadSnaps] = useState([])
  const [olderPageSnaps, setOlderPageSnaps] = useState([])
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadMoreLoading, setLoadMoreLoading] = useState(false)
  const [postOverlay, setPostOverlay] = useState({})
  const [members, setMembers] = useState([])

  const [filterUserIds, setFilterUserIds] = useState([])
  const [filterActivityIds, setFilterActivityIds] = useState([])
  const filterBarRef = useRef(null)
  const [filterMenuOpen, setFilterMenuOpen] = useState(null)

  const [expandedPostId, setExpandedPostId] = useState(null)
  const [commentsByPostId, setCommentsByPostId] = useState({})
  const [commentsLoadingId, setCommentsLoadingId] = useState(null)
  const [commentActionError, setCommentActionError] = useState('')
  const [likeBusyId, setLikeBusyId] = useState(null)

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
  const isGroupOwner = Boolean(user?.uid && group?.ownerId === user.uid)

  const {
    activities,
    member,
    pendingByActivityId,
    pickerDataReady,
    isMember: completionMember,
  } = useGroupCompletionPickerData(groupId, user?.uid)

  const showCompleteFab =
    Boolean(groupId) &&
    pickerDataReady &&
    completionMember &&
    hasAnyEligibleCompletionActivity(activities, member, pendingByActivityId)

  useEffect(() => {
    if (!groupId || !isMember) {
      setMembers([])
      return
    }
    const unsub = subscribeGroupMembers(
      groupId,
      (list) => setMembers(list),
      () => setMembers([]),
    )
    return () => unsub()
  }, [groupId, isMember])

  useEffect(() => {
    if (!groupId || !isMember) return
    setFeedError('')
    setHeadSnaps([])
    setOlderPageSnaps([])
    setHasMoreOlder(false)
    setPostOverlay({})
    setExpandedPostId(null)
    setCommentsByPostId({})
    setFilterUserIds([])
    setFilterActivityIds([])
    setFilterMenuOpen(null)

    const unsub = subscribeGroupFeedHead(
      groupId,
      ({ snapshots }) => {
        setHeadSnaps(snapshots)
        setPostOverlay((o) => {
          const next = { ...o }
          for (const d of snapshots) delete next[d.id]
          return next
        })
      },
      (e) => setFeedError(e.message || t('feed.errorLoadFeed')),
    )
    return () => unsub()
  }, [groupId, isMember, t])

  useEffect(() => {
    if (olderPageSnaps.length > 0) return
    setHasMoreOlder(headSnaps.length === FEED_PAGE_SIZE)
  }, [headSnaps.length, olderPageSnaps.length])

  const mergedPosts = useMemo(() => mergeFeedPosts(headSnaps, olderPageSnaps), [headSnaps, olderPageSnaps])

  const snapMap = useMemo(
    () => buildFeedSnapMap(headSnaps, olderPageSnaps),
    [headSnaps, olderPageSnaps],
  )

  const displayPosts = useMemo(
    () => mergedPosts.map((p) => postOverlay[p.id] ?? p),
    [mergedPosts, postOverlay],
  )

  const filteredPosts = useMemo(
    () => displayPosts.filter((p) => postMatchesFilters(p, filterUserIds, filterActivityIds)),
    [displayPosts, filterUserIds, filterActivityIds],
  )

  const firstImagePostId = useMemo(() => {
    for (const p of filteredPosts) {
      if (p.type !== 'system' && docHasPhoto(p)) return p.id
    }
    return null
  }, [filteredPosts])

  const loadMore = useCallback(async () => {
    if (!groupId || loadMoreLoading) return
    const cursor = getOldestMergedFeedSnapshot(mergedPosts, snapMap)
    if (!cursor) return
    setLoadMoreLoading(true)
    setFeedError('')
    try {
      const { snapshots, hasMore } = await fetchFeedOlderPage(groupId, cursor)
      setOlderPageSnaps((p) => [...p, snapshots])
      setHasMoreOlder(hasMore)
    } catch (e) {
      setFeedError(e.message || t('feed.errorLoadOlder'))
    } finally {
      setLoadMoreLoading(false)
    }
  }, [groupId, loadMoreLoading, mergedPosts, snapMap, t])

  const addUserFilter = (uid) => {
    setFilterUserIds((prev) => (prev.includes(uid) ? prev : [...prev, uid]))
  }

  const addActivityFilter = (aid) => {
    setFilterActivityIds((prev) => (prev.includes(aid) ? prev : [...prev, aid]))
  }

  const removeUserFilter = (uid) => {
    setFilterUserIds((prev) => prev.filter((x) => x !== uid))
  }

  const removeActivityFilter = (aid) => {
    setFilterActivityIds((prev) => prev.filter((x) => x !== aid))
  }

  const clearFilters = () => {
    setFilterUserIds([])
    setFilterActivityIds([])
    setFilterMenuOpen(null)
  }

  const filterActive = filterUserIds.length > 0 || filterActivityIds.length > 0

  const displayFirstName = useCallback(
    (displayName) => {
      if (!displayName || typeof displayName !== 'string') return t('groupShell.displayNameFallback')
      const part = displayName.trim().split(/\s+/)[0]
      return part || t('groupShell.displayNameFallback')
    },
    [t],
  )

  const membersPickList = useMemo(
    () => members.filter((m) => !filterUserIds.includes(m.id)),
    [members, filterUserIds],
  )

  const activitiesPickList = useMemo(
    () => activities.filter((a) => !filterActivityIds.includes(a.id)),
    [activities, filterActivityIds],
  )

  useEffect(() => {
    if (!filterMenuOpen) return
    function onPointerDown(e) {
      if (filterBarRef.current && !filterBarRef.current.contains(e.target)) {
        setFilterMenuOpen(null)
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setFilterMenuOpen(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [filterMenuOpen])

  const toggleComments = useCallback(
    async (postId) => {
      setCommentActionError('')
      if (expandedPostId === postId) {
        setExpandedPostId(null)
        return
      }
      setExpandedPostId(postId)
      if (!commentsByPostId[postId]) {
        setCommentsLoadingId(postId)
        try {
          const list = await listFeedPostComments(groupId, postId)
          setCommentsByPostId((prev) => ({ ...prev, [postId]: list }))
        } catch (e) {
          setCommentActionError(e.message || t('feed.errorLoadComments'))
        } finally {
          setCommentsLoadingId(null)
        }
      }
    },
    [commentsByPostId, expandedPostId, groupId, t],
  )

  const handleSubmitComment = useCallback(
    async (postId, text) => {
      if (!user?.uid) return
      setCommentActionError('')
      try {
        await addFeedPostComment(groupId, postId, {
          userId: user.uid,
          displayName: member?.displayName || user.displayName || 'Member',
          avatarUrl: member?.avatarUrl ?? null,
          text,
        })
        const list = await listFeedPostComments(groupId, postId)
        setCommentsByPostId((prev) => ({ ...prev, [postId]: list }))
      } catch (e) {
        setCommentActionError(e.message || t('feed.errorPostComment'))
        throw e
      }
    },
    [groupId, member, user, t],
  )

  const handleDeleteComment = useCallback(
    async (postId, commentId) => {
      setCommentActionError('')
      try {
        await deleteFeedPostComment(groupId, postId, commentId)
        const list = await listFeedPostComments(groupId, postId)
        setCommentsByPostId((prev) => ({ ...prev, [postId]: list }))
      } catch (e) {
        setCommentActionError(e.message || t('feed.errorDeleteComment'))
      }
    },
    [groupId, t],
  )

  const handleLike = useCallback(
    async (post) => {
      if (!user?.uid || !groupId) return
      const likes = Array.isArray(post.likes) ? post.likes : []
      const nextLiked = !likes.includes(user.uid)
      setLikeBusyId(post.id)
      setFeedError('')
      try {
        await setFeedPostLiked(groupId, post.id, user.uid, nextLiked)
        const fresh = await getFeedPost(groupId, post.id)
        if (fresh) setPostOverlay((o) => ({ ...o, [post.id]: fresh }))
      } catch (e) {
        setFeedError(e.message || t('feed.errorLike'))
      } finally {
        setLikeBusyId(null)
      }
    },
    [groupId, user?.uid, t],
  )

  return (
    <div
      className={`relative text-tour-text ${showCompleteFab ? 'pb-[calc(5rem+env(safe-area-inset-bottom,0px))]' : ''}`}
    >
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

      {feedError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {feedError}
        </div>
      )}

      {isMember && (
        <div className="mb-3 rounded-xl border border-black/10 bg-tour-surface px-3 py-2">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-tour-text-secondary">
            {t('feed.filterHeading')}
          </p>
          <div
            ref={filterBarRef}
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => {
                clearFilters()
              }}
              className={[
                'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                !filterActive
                  ? 'border-tour-accent bg-tour-accent-muted text-tour-accent-foreground'
                  : 'border-black/15 bg-tour-muted text-tour-text-secondary hover:bg-black/[0.04]',
              ].join(' ')}
            >
              {t('feed.filterAll')}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setFilterMenuOpen((prev) => (prev === 'people' ? null : 'people'))
                }
                aria-haspopup="listbox"
                aria-expanded={filterMenuOpen === 'people'}
                className={[
                  'inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  filterMenuOpen === 'people' || filterUserIds.length > 0
                    ? 'border-tour-accent/50 bg-tour-accent-muted/40 text-tour-accent-foreground'
                    : 'border-black/15 bg-tour-muted text-tour-text-secondary hover:bg-black/[0.04]',
                ].join(' ')}
              >
                {t('feed.filterPeople')}
                <ChevronDownIcon
                  className={[
                    'opacity-80 transition-transform',
                    filterMenuOpen === 'people' ? 'rotate-180' : '',
                  ].join(' ')}
                />
              </button>
              {filterMenuOpen === 'people' ? (
                <ul
                  className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-48 min-w-[12rem] overflow-y-auto rounded-xl border border-black/10 bg-tour-surface py-1 shadow-lg"
                  role="listbox"
                >
                  {membersPickList.length === 0 ? (
                    <li className="px-3 py-2 text-[12px] text-tour-text-secondary">
                      {t('feed.filterPeopleNoResults')}
                    </li>
                  ) : (
                    membersPickList.map((m) => (
                      <li key={m.id} role="option">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-tour-text hover:bg-tour-muted"
                          onClick={() => {
                            addUserFilter(m.id)
                            setFilterMenuOpen(null)
                          }}
                        >
                          <Avatar
                            avatarUrl={m.avatarUrl}
                            displayName={m.displayName}
                            seed={m.id}
                            className="h-7 w-7 text-[10px]"
                            alt=""
                          />
                          <span className="min-w-0 truncate">
                            {m.displayName || t('groupShell.displayNameFallback')}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setFilterMenuOpen((prev) => (prev === 'activities' ? null : 'activities'))
                }
                aria-haspopup="listbox"
                aria-expanded={filterMenuOpen === 'activities'}
                className={[
                  'inline-flex shrink-0 items-center gap-0.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  filterMenuOpen === 'activities' || filterActivityIds.length > 0
                    ? 'border-tour-accent/50 bg-tour-accent-muted/40 text-tour-accent-foreground'
                    : 'border-black/15 bg-tour-muted text-tour-text-secondary hover:bg-black/[0.04]',
                ].join(' ')}
              >
                {t('feed.filterActivities')}
                <ChevronDownIcon
                  className={[
                    'opacity-80 transition-transform',
                    filterMenuOpen === 'activities' ? 'rotate-180' : '',
                  ].join(' ')}
                />
              </button>
              {filterMenuOpen === 'activities' ? (
                <ul
                  className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-48 min-w-[12rem] overflow-y-auto rounded-xl border border-black/10 bg-tour-surface py-1 shadow-lg"
                  role="listbox"
                >
                  {activitiesPickList.length === 0 ? (
                    <li className="px-3 py-2 text-[12px] text-tour-text-secondary">
                      {t('feed.filterActivitiesNoResults')}
                    </li>
                  ) : (
                    activitiesPickList.map((a) => (
                      <li key={a.id} role="option">
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-[13px] text-tour-text hover:bg-tour-muted"
                          onClick={() => {
                            addActivityFilter(a.id)
                            setFilterMenuOpen(null)
                          }}
                        >
                          {a.name || t('feed.activityFallback')}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>

            {filterUserIds.map((uid) => {
              const m = members.find((x) => x.id === uid)
              const label = m ? displayFirstName(m.displayName) : t('groupShell.displayNameFallback')
              return (
                <div
                  key={uid}
                  className="inline-flex max-w-[min(100%,11rem)] shrink-0 items-center gap-1 rounded-full border border-tour-accent bg-tour-accent-muted pl-1.5 pr-0.5 text-[11px] font-medium text-tour-accent-foreground"
                >
                  {m ? (
                    <Avatar
                      avatarUrl={m.avatarUrl}
                      displayName={m.displayName}
                      seed={m.id}
                      className="h-5 w-5 text-[8px]"
                      alt=""
                    />
                  ) : null}
                  <span className="min-w-0 truncate">{label}</span>
                  <button
                    type="button"
                    onClick={() => removeUserFilter(uid)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-red-500/10"
                    aria-label={t('feed.removeFromFilterAria', { name: label })}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              )
            })}

            {filterActivityIds.map((aid) => {
              const a = activities.find((x) => x.id === aid)
              const label = a?.name || t('feed.activityFallback')
              return (
                <div
                  key={aid}
                  className="inline-flex max-w-[min(100%,12rem)] shrink-0 items-center gap-1 rounded-full border border-tour-accent bg-tour-accent-muted pl-2 pr-0.5 text-[11px] font-medium text-tour-accent-foreground"
                >
                  <span className="min-w-0 truncate">{label}</span>
                  <button
                    type="button"
                    onClick={() => removeActivityFilter(aid)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-red-600 hover:bg-red-500/10"
                    aria-label={t('feed.removeFromFilterAria', { name: label })}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!loadingGroup && isMember && !feedError && mergedPosts.length === 0 && (
        <p className="rounded-xl border border-black/10 bg-tour-surface p-4 text-sm text-tour-text-secondary">
          {t('feed.emptyState')}
        </p>
      )}

      {filterActive && mergedPosts.length > 0 && filteredPosts.length === 0 && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
          {t('feed.filterNoMatch')}
        </p>
      )}

      {filterActive && filteredPosts.length > 0 && filteredPosts.length < mergedPosts.length && (
        <p className="mb-3 text-[12px] text-tour-text-secondary">
          {t('feed.filterShowingPartial', {
            shown: filteredPosts.length,
            total: mergedPosts.length,
          })}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filteredPosts.map((post) => {
          if (post.type === 'system') {
            return (
              <article
                key={post.id}
                className="rounded-lg border border-black/10 bg-tour-muted px-3 py-2 text-center text-[12px] leading-snug text-tour-text-secondary"
              >
                {systemFeedDisplayText(post, t)}
              </article>
            )
          }

          return (
            <FeedPostCard
              key={post.id}
              post={post}
              groupId={groupId}
              isHeroImage={post.id === firstImagePostId}
              currentUserId={user?.uid}
              isGroupOwner={isGroupOwner}
              expanded={expandedPostId === post.id}
              onToggleComments={() => toggleComments(post.id)}
              comments={commentsByPostId[post.id] || []}
              commentsLoading={commentsLoadingId === post.id}
              onSubmitComment={(text) => handleSubmitComment(post.id, text)}
              onDeleteComment={(cid) => handleDeleteComment(post.id, cid)}
              commentError={expandedPostId === post.id ? commentActionError : ''}
              onLikeToggle={() => handleLike(post)}
              likeBusy={likeBusyId === post.id}
            />
          )
        })}
      </div>

      {isMember && hasMoreOlder && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            disabled={loadMoreLoading}
            onClick={() => loadMore()}
            className="rounded-lg border border-black/15 bg-tour-surface px-4 py-2 text-[13px] font-medium text-tour-text hover:bg-tour-muted disabled:opacity-60"
          >
            {loadMoreLoading ? t('feed.loadingShort') : t('feed.loadMore')}
          </button>
        </div>
      )}

      {showCompleteFab && (
        <Link
          to={`/group/${groupId}/complete`}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-tour-accent text-white shadow-lg hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent focus-visible:ring-offset-2"
          aria-label={t('feed.completeTaskAria')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      )}
    </div>
  )
}
