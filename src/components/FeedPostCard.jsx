import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'
import { Avatar } from './Avatar'
import { MedalBadge } from './MedalBadge'
import { normalizeDocPhotos } from '../lib/feedPhotos'
import { formatFeedTime, medalTierForPost } from '../lib/feedDisplay'
import { FeedPhotoCarousel } from './FeedPhotoCarousel'
import { FeedPhotoExpandButton, FeedPhotoLightbox } from './FeedPhotoLightbox'
import { MAX_COMMENT_CHARS } from '../services/feedInteractionsService'

function HeartIcon({ filled }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className={filled ? 'text-red-500' : 'text-tour-text-secondary'}
      />
    </svg>
  )
}

/**
 * @param {{
 *   post: object,
 *   groupId: string,
 *   isHeroImage: boolean,
 *   currentUserId: string | undefined,
 *   isGroupOwner: boolean,
 *   expanded: boolean,
 *   onToggleComments: () => void,
 *   comments: Array<object>,
 *   commentsLoading: boolean,
 *   onSubmitComment: (text: string) => Promise<void>,
 *   onDeleteComment: (commentId: string) => Promise<void>,
 *   commentError: string,
 *   onLikeToggle: () => Promise<void>,
 *   likeBusy: boolean,
 * }} props
 */
export function FeedPostCard({
  post,
  groupId,
  isHeroImage,
  currentUserId,
  isGroupOwner,
  expanded,
  onToggleComments,
  comments,
  commentsLoading,
  onSubmitComment,
  onDeleteComment,
  commentError,
  onLikeToggle,
  likeBusy,
}) {
  const { t, language } = useTranslation()
  const [draft, setDraft] = useState('')
  const [fullOpen, setFullOpen] = useState(false)

  const likes = Array.isArray(post.likes) ? post.likes : []
  const liked = Boolean(currentUserId && likes.includes(currentUserId))
  const likeCount = likes.length

  const serverCommentCount = typeof post.commentCount === 'number' ? post.commentCount : 0
  const commentLabelCount = Math.max(serverCommentCount, comments.length)

  const photos = normalizeDocPhotos(post)

  const headerBody = (
    <>
      <Avatar
        avatarUrl={post.avatarUrl}
        displayName={post.displayName}
        seed={post.userId}
        className="h-8 w-8 text-[12px]"
        alt=""
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-tour-text">
          {post.displayName || t('groupShell.displayNameFallback')}
        </p>
        <p className="text-[11px] text-tour-text-secondary">
          {formatFeedTime(post.timestamp, { t, language })}
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

  async function handleSubmit(e) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    await onSubmitComment(text)
    setDraft('')
  }

  return (
    <article className="overflow-hidden rounded-xl border border-black/10 bg-tour-surface">
      {header}

      {photos.length > 1 ? (
        <FeedPhotoCarousel photos={photos} isHeroImage={isHeroImage} />
      ) : photos.length === 1 ? (
        <div className="relative h-[550px] w-full overflow-hidden bg-[#EAF3DE] sm:h-[700px]">
          <img
            src={photos[0].url}
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            fetchPriority={isHeroImage ? 'high' : undefined}
            loading={isHeroImage ? 'eager' : 'lazy'}
          />
          <FeedPhotoExpandButton onClick={() => setFullOpen(true)} />
        </div>
      ) : (
        <div className="flex h-[500px] w-full items-center justify-center bg-[#EAF3DE] sm:h-[700px]">
          <span className="text-[11px] text-[#3B6D11]">{t('feed.photoPlaceholder')}</span>
        </div>
      )}

      <div className="px-3 py-2.5">
        <p className="mb-1 text-[13px] text-tour-text">
          {t('feed.taskCompletedLine', {
            task: post.taskName || t('feed.taskFallback'),
            activity: post.activityName || t('feed.activityFallback'),
          })}
        </p>
        {post.description ? (
          <p className="text-[12px] leading-snug text-tour-text-secondary">{post.description}</p>
        ) : null}

        {currentUserId && (
          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-black/10 pt-3">
            <button
              type="button"
              disabled={likeBusy}
              onClick={() => onLikeToggle()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-tour-text-secondary hover:bg-black/[0.04] hover:text-tour-text disabled:opacity-50"
              aria-pressed={liked}
            >
              <HeartIcon filled={liked} />
              <span>
                {likeCount === 1
                  ? t('feed.likeOne', { count: likeCount })
                  : t('feed.likeOther', { count: likeCount })}
              </span>
            </button>
            <button
              type="button"
              onClick={onToggleComments}
              className="rounded-lg py-1 text-[12px] font-medium text-tour-accent-foreground hover:underline"
              aria-expanded={expanded}
            >
              {commentLabelCount > 0
                ? t('feed.commentsWithCount', { count: commentLabelCount })
                : t('feed.comments')}
            </button>
          </div>
        )}

        {expanded && currentUserId && (
          <div className="mt-3 border-t border-black/10 pt-3">
            {commentsLoading ? (
              <p className="text-[12px] text-tour-text-secondary">{t('feed.loadingComments')}</p>
            ) : (
              <ul className="space-y-2">
                {comments.map((c) => {
                  const mine = c.userId === currentUserId
                  const canDelete = mine || isGroupOwner
                  return (
                    <li key={c.id} className="flex gap-2 text-[12px]">
                      <Avatar
                        avatarUrl={c.avatarUrl}
                        displayName={c.displayName}
                        seed={c.userId}
                        className="h-7 w-7 shrink-0 text-[10px]"
                        alt=""
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium text-tour-text-secondary">
                          {c.displayName || t('groupShell.displayNameFallback')}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-snug text-tour-text">
                          {c.text}
                        </p>
                      </div>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => onDeleteComment(c.id)}
                          className="shrink-0 text-[11px] text-red-700 hover:underline"
                        >
                          {t('feed.delete')}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <form onSubmit={handleSubmit} className="mt-3">
              <label htmlFor={`comment-${post.id}`} className="sr-only">
                {t('feed.commentFieldLabel')}
              </label>
              <textarea
                id={`comment-${post.id}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_COMMENT_CHARS))}
                rows={2}
                maxLength={MAX_COMMENT_CHARS}
                placeholder={t('feed.commentPlaceholder')}
                className="w-full resize-y rounded-lg border border-black/15 bg-tour-surface px-3 py-2 text-[13px] text-tour-text placeholder:text-tour-text-tertiary focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent"
              />
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-[10px] text-tour-text-secondary">
                  {draft.length}/{MAX_COMMENT_CHARS}
                </span>
                <button
                  type="submit"
                  disabled={!draft.trim() || commentsLoading}
                  className="rounded-lg bg-tour-accent px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-95 disabled:opacity-50"
                >
                  {t('feed.postComment')}
                </button>
              </div>
              {commentError ? <p className="mt-1 text-[11px] text-red-700">{commentError}</p> : null}
            </form>
          </div>
        )}
      </div>
      {fullOpen && (
        <FeedPhotoLightbox
          isOpen={fullOpen}
          photos={photos}
          initialIndex={0}
          onClose={() => setFullOpen(false)}
        />
      )}
    </article>
  )
}
