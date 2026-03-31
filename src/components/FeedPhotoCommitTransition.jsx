import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

/**
 * Tier 1: opacity + short horizontal nudge when `index` changes (commit animation only).
 * Tier 2 (drag-follow) is intentionally not implemented.
 *
 * @param {{
 *   urls: string[],
 *   index: number,
 *   variant?: 'cover' | 'contain',
 *   getImgProps?: (index: number) => Record<string, unknown>,
 * }} props
 */
export function FeedPhotoCommitTransition({ urls, index, variant = 'cover', getImgProps }) {
  const reducedMotion = usePrefersReducedMotion()
  const latestIndexRef = useRef(index)

  useEffect(() => {
    latestIndexRef.current = index
  }, [index])

  const [settledIndex, setSettledIndex] = useState(index)

  const propsFor = (i) => (typeof getImgProps === 'function' ? getImgProps(i) : {})

  const coverBase = 'absolute inset-0 block h-full w-full object-cover'
  const containBaseFlow = 'relative z-0 block max-h-full max-w-full object-contain'
  const containOverlay = 'absolute inset-0 z-10 m-auto block max-h-full max-w-full object-contain'

  function finishTransition() {
    setSettledIndex(latestIndexRef.current)
  }

  const url = urls[index]
  if (!url) return null

  if (reducedMotion) {
    return (
      <img
        src={url}
        alt=""
        className={
          variant === 'cover'
            ? 'block h-full w-full object-cover'
            : 'max-h-full max-w-full cursor-pointer object-contain'
        }
        {...propsFor(index)}
      />
    )
  }

  if (settledIndex !== index) {
    const from = settledIndex
    const to = index
    const dir = to > from ? 1 : to < from ? -1 : 1
    const fromUrl = urls[from]
    const toUrl = urls[to]
    if (!fromUrl || !toUrl) {
      return (
        <img
          src={url}
          alt=""
          className={
            variant === 'cover'
              ? 'block h-full w-full object-cover'
              : 'max-h-full max-w-full cursor-pointer object-contain'
          }
          {...propsFor(index)}
        />
      )
    }

    if (variant === 'cover') {
      return (
        <div className="relative h-full w-full">
          <img src={fromUrl} alt="" className={coverBase} {...propsFor(from)} />
          <img
            key={`${to}-${from}-${dir}`}
            src={toUrl}
            alt=""
            className={`${coverBase} feed-photo-commit-anim`}
            style={{ '--feed-slide-enter': `${dir * 14}px` }}
            onAnimationEnd={finishTransition}
            {...propsFor(to)}
          />
        </div>
      )
    }

    return (
      <div className="relative max-h-full max-w-full cursor-pointer">
        <img src={fromUrl} alt="" className={containBaseFlow} {...propsFor(from)} />
        <img
          key={`${to}-${from}-${dir}`}
          src={toUrl}
          alt=""
          className={`${containOverlay} feed-photo-commit-anim`}
          style={{ '--feed-slide-enter': `${dir * 14}px` }}
          onAnimationEnd={finishTransition}
          {...propsFor(to)}
        />
      </div>
    )
  }

  return (
    <img
      src={urls[settledIndex]}
      alt=""
      className={
        variant === 'cover'
          ? 'block h-full w-full object-cover'
          : 'max-h-full max-w-full cursor-pointer object-contain'
      }
      {...propsFor(settledIndex)}
    />
  )
}
