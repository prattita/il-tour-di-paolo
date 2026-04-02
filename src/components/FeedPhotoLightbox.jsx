import { useEffect, useMemo, useRef, useState } from 'react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useTranslation } from '../hooks/useTranslation'
import { FeedPhotoCommitTransition } from './FeedPhotoCommitTransition'
import { FeedPhotoWarmStrip } from './FeedPhotoWarmStrip'

/** Expand control for feed media. Default: fixed bottom-right on the media frame. Use `inline` when placed in a bottom bar (e.g. carousel). */
export function FeedPhotoExpandButton({ onClick, inline = false }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label={t('feed.viewFullImage')}
      className={[
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        'bg-black/55 text-white shadow-sm backdrop-blur-[2px] hover:bg-black/65',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
        inline ? 'relative z-10' : 'absolute bottom-3 right-3 z-10',
      ].join(' ')}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/**
 * @param {{
 *   isOpen: boolean,
 *   photos: Array<{ url: string }>,
 *   initialIndex?: number,
 *   onClose: () => void,
 *   getImgProps?: (index: number) => Record<string, unknown>,
 *   overlayAriaLabel?: string,
 * }} props
 */
const SWIPE_DOWN_PX = 64

export function FeedPhotoLightbox({
  isOpen,
  photos,
  initialIndex = 0,
  onClose,
  getImgProps = undefined,
  overlayAriaLabel,
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(initialIndex)
  const touchStartY = useRef(null)
  const dialogRef = useRef(null)
  const photoUrls = useMemo(() => photos.map((p) => p.url), [photos])

  const trapActive = Boolean(isOpen && photos.length > 0 && photos[index])
  useFocusTrap(dialogRef, trapActive)

  useEffect(() => {
    if (!isOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(photos.length - 1, i + 1))
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, onClose, photos.length])

  if (!isOpen || photos.length === 0 || !photos[index]) return null

  const dialogAriaLabel = overlayAriaLabel ?? t('feed.lightboxOverlayAria')
  const hasMany = photos.length > 1

  function onDismissLayerClick(e) {
    if (e.target.closest('button')) return
    onClose()
  }

  function onTouchStart(e) {
    touchStartY.current = e.touches[0].clientY
  }

  function onTouchEnd(e) {
    if (touchStartY.current == null) return
    const dy = e.changedTouches[0].clientY - touchStartY.current
    touchStartY.current = null
    if (dy > SWIPE_DOWN_PX) onClose()
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-black/90"
      role="dialog"
      aria-modal
      aria-label={dialogAriaLabel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="relative z-10 flex h-full w-full cursor-default items-center justify-center p-4"
        onClick={onDismissLayerClick}
      >
        <FeedPhotoWarmStrip urls={photoUrls} variant="contain" />
        <div className="relative z-[1] flex h-full min-h-0 w-full min-w-0 flex-1 items-center justify-center">
          <FeedPhotoCommitTransition
            urls={photoUrls}
            index={index}
            variant="contain"
            getImgProps={getImgProps}
          />
        </div>

        {hasMany && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIndex((i) => Math.max(0, i - 1))
              }}
              disabled={index === 0}
              aria-label={t('feed.ariaPrevPhoto')}
              className="absolute left-3 top-1/2 z-[2] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-tour-text shadow-sm transition hover:bg-white disabled:cursor-default disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M15 18l-6-6 6-6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setIndex((i) => Math.min(photos.length - 1, i + 1))
              }}
              disabled={index === photos.length - 1}
              aria-label={t('feed.ariaNextPhoto')}
              className="absolute right-3 top-1/2 z-[2] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-tour-text shadow-sm transition hover:bg-white disabled:cursor-default disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          aria-label={t('feed.lightboxClose')}
          className="absolute right-3 top-3 z-[2] flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/90 text-tour-text shadow-sm transition hover:bg-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {hasMany && (
          <div className="pointer-events-none absolute right-3 top-16 z-[2] rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white">
            {index + 1}/{photos.length}
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          aria-label={t('feed.lightboxCloseFull')}
          className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/25 bg-white/15 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/25 md:hidden"
        >
          {t('feed.lightboxDone')}
        </button>
      </div>
    </div>
  )
}
