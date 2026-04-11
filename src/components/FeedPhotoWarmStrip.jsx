/**
 * Invisible stacked <img> nodes for every carousel URL (max 3 in this app).
 * Stays mounted while the card/lightbox lives so decoded bitmaps stay warm when
 * FeedPhotoCommitTransition unmounts non-active slides.
 *
 * Render as z-0 under the visible transition layer (z-1). pointer-events-none + aria-hidden.
 * Fetch: visible layer owns LCP (high on hero slide 0). Strip slot 0 uses auto on hero to avoid starving slide 1.
 * Hero slide 1 = high so first 0→1 swipe isn’t janky; last slide when 3-up = low; else auto.
 *
 * @param {{
 *   urls: string[],
 *   variant: 'cover' | 'contain',
 *   isHeroImage?: boolean,
 * }} props
 */
function warmStripFetchPriority(i, urls, isHeroImage) {
  if (isHeroImage && i === 0) return 'auto'
  if (isHeroImage && i === 1 && urls.length >= 2) return 'high'
  if (urls.length > 2 && i === urls.length - 1) return 'low'
  return 'auto'
}

export function FeedPhotoWarmStrip({ urls, variant, isHeroImage = false }) {
  if (urls.length < 2) return null

  const imgClassCover =
    'pointer-events-none absolute inset-0 block h-full w-full select-none object-cover opacity-0'
  const imgClassContain =
    'pointer-events-none absolute left-1/2 top-1/2 block max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 select-none object-contain opacity-0'

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {urls.map((url, i) => (
        <img
          key={`${url}-${i}`}
          src={url}
          alt=""
          decoding="async"
          fetchPriority={warmStripFetchPriority(i, urls, isHeroImage)}
          loading="eager"
          className={variant === 'cover' ? imgClassCover : imgClassContain}
        />
      ))}
    </div>
  )
}
