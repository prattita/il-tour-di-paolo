/**
 * Invisible stacked <img> nodes for every carousel URL (max 3 in this app).
 * Stays mounted while the card/lightbox lives so decoded bitmaps stay warm when
 * FeedPhotoCommitTransition unmounts non-active slides.
 *
 * Render as z-0 under the visible transition layer (z-1). pointer-events-none + aria-hidden.
 *
 * @param {{
 *   urls: string[],
 *   variant: 'cover' | 'contain',
 *   isHeroImage?: boolean,
 * }} props
 */
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
          fetchPriority={isHeroImage && i === 0 ? 'high' : 'low'}
          loading="eager"
          className={variant === 'cover' ? imgClassCover : imgClassContain}
        />
      ))}
    </div>
  )
}
