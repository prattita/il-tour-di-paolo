import { useEffect, useState } from 'react'

/** Expand control for feed media. Default: fixed bottom-right on the media frame. Use `inline` when placed in a bottom bar (e.g. carousel). */
export function FeedPhotoExpandButton({ onClick, inline = false }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      aria-label="View full image"
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
 * }} props
 */
export function FeedPhotoLightbox({ isOpen, photos, initialIndex = 0, onClose }) {
  const [index, setIndex] = useState(initialIndex)

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

  const hasMany = photos.length > 1
  return (
    <div className="fixed inset-0 z-50 bg-black/90" role="dialog" aria-modal>
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label="Close full view"
      />

      <div className="relative z-10 flex h-full w-full items-center justify-center p-4">
        <img src={photos[index].url} alt="" className="max-h-full max-w-full object-contain" />

        {hasMany && (
          <>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-tour-text shadow-sm transition hover:bg-white disabled:cursor-default disabled:opacity-40"
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
              onClick={() => setIndex((i) => Math.min(photos.length - 1, i + 1))}
              disabled={index === photos.length - 1}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-tour-text shadow-sm transition hover:bg-white disabled:cursor-default disabled:opacity-40"
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
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/90 text-tour-text shadow-sm transition hover:bg-white"
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
          <div className="absolute right-3 top-16 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white">
            {index + 1}/{photos.length}
          </div>
        )}
      </div>
    </div>
  )
}
