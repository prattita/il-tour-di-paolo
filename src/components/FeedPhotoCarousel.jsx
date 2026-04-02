import { useCallback, useMemo, useRef, useState } from 'react'
import { FeedPhotoCommitTransition } from './FeedPhotoCommitTransition'
import { FeedPhotoExpandButton, FeedPhotoLightbox } from './FeedPhotoLightbox'
import { FeedPhotoWarmStrip } from './FeedPhotoWarmStrip'

const SWIPE_PX = 48
const CAROUSEL_HEIGHT_CLASS = 'h-[500px] sm:h-[700px]'

/**
 * @param {{
 *   photos: Array<{ url: string, width: number, height: number }>,
 *   isHeroImage: boolean,
 * }} props
 */
export function FeedPhotoCarousel({ photos, isHeroImage }) {
  const [index, setIndex] = useState(0)
  const [fullOpen, setFullOpen] = useState(false)
  const touchStartX = useRef(null)

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(photos.length - 1, i + 1))
  }, [photos.length])

  const current = photos[index]
  const photoUrls = useMemo(() => photos.map((p) => p.url), [photos])
  const prefetchSiblings = photos.length > 1

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
  }

  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return
    const x = e.changedTouches[0].clientX
    const dx = x - touchStartX.current
    touchStartX.current = null
    if (dx < -SWIPE_PX) goNext()
    else if (dx > SWIPE_PX) goPrev()
  }

  if (!current) return null

  return (
    <div className="relative bg-[#EAF3DE]">
      <div
        className={`relative mx-auto w-full overflow-hidden ${CAROUSEL_HEIGHT_CLASS}`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <FeedPhotoWarmStrip urls={photoUrls} variant="cover" isHeroImage={isHeroImage} />
        <div className="relative z-[1] h-full w-full">
          <FeedPhotoCommitTransition
            key={photoUrls.join('|')}
            urls={photoUrls}
            index={index}
            variant="cover"
            getImgProps={(i) => ({
              decoding: 'async',
              fetchPriority:
                isHeroImage && i === 0 ? 'high' : prefetchSiblings && i > 0 ? 'low' : undefined,
              loading: prefetchSiblings || (isHeroImage && i === 0) ? 'eager' : 'lazy',
            })}
          />
        </div>
        <div className="pointer-events-none absolute right-3 top-3 z-[2] rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white">
          {index + 1}/{photos.length}
        </div>
        <button
          type="button"
          className="absolute inset-y-0 left-0 z-[2] w-1/3 cursor-pointer bg-transparent"
          onClick={goPrev}
          aria-label="Previous photo"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 z-[2] w-1/3 cursor-pointer bg-transparent"
          onClick={goNext}
          aria-label="Next photo"
        />
        <button
          type="button"
          onClick={goPrev}
          aria-label="Previous photo"
          disabled={index === 0}
          className="absolute left-3 top-1/2 z-[2] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-tour-text shadow-sm transition hover:bg-white disabled:cursor-default disabled:opacity-40 md:flex"
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
          onClick={goNext}
          aria-label="Next photo"
          disabled={index === photos.length - 1}
          className="absolute right-3 top-1/2 z-[2] hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white/90 text-tour-text shadow-sm transition hover:bg-white disabled:cursor-default disabled:opacity-40 md:flex"
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
      </div>
      <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-10 flex items-center px-3">
        <div className="w-10 shrink-0" aria-hidden />
        <div className="flex min-w-0 flex-1 justify-center">
          <div className="pointer-events-auto flex items-center gap-1.5" role="tablist" aria-label="Photos">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={[
                  'h-2.5 w-2.5 rounded-full border border-black/15 shadow-sm transition-colors',
                  i === index ? 'bg-tour-accent' : 'bg-white/90 hover:bg-white',
                ].join(' ')}
                onClick={() => setIndex(i)}
                aria-label={`Photo ${i + 1} of ${photos.length}`}
              />
            ))}
          </div>
        </div>
        <div className="pointer-events-auto flex w-10 shrink-0 justify-end">
          <FeedPhotoExpandButton inline onClick={() => setFullOpen(true)} />
        </div>
      </div>
      {fullOpen && (
        <FeedPhotoLightbox
          isOpen={fullOpen}
          photos={photos}
          initialIndex={index}
          onClose={() => setFullOpen(false)}
        />
      )}
    </div>
  )
}
