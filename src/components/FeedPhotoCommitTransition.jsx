import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

/**
 * Incoming slide: stay opacity-0 until decode/load, then run commit animation.
 * Avoids “snap” when LCP/hero delays slide 2 bytes but CSS animation already finished.
 */
function IncomingCommitOverlay({
  variant,
  fromUrl,
  toUrl,
  dir,
  fromProps,
  toProps,
  coverBase,
  containBaseFlow,
  containOverlay,
  onCommitAnimationEnd,
}) {
  const [runAnim, setRunAnim] = useState(false)
  const topRef = useRef(null)

  useLayoutEffect(() => {
    let cancelled = false
    const fallbackMs = 480
    const fallbackId = window.setTimeout(() => {
      if (!cancelled) setRunAnim(true)
    }, fallbackMs)

    function arm() {
      if (cancelled) return
      window.clearTimeout(fallbackId)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setRunAnim(true)
        })
      })
    }

    const el = topRef.current
    if (!el) {
      arm()
      return () => {
        cancelled = true
        window.clearTimeout(fallbackId)
      }
    }

    function afterUsable() {
      const d = el.decode?.()
      if (d && typeof d.then === 'function') d.then(arm).catch(arm)
      else arm()
    }

    if (el.complete) afterUsable()
    else el.addEventListener('load', afterUsable, { once: true })

    return () => {
      cancelled = true
      window.clearTimeout(fallbackId)
    }
  }, [toUrl, fromUrl, dir])

  const slideVar = { '--feed-slide-enter': `${dir * 14}px` }

  if (variant === 'cover') {
    return (
      <div className="relative h-full w-full">
        <img src={fromUrl} alt="" className={coverBase} {...fromProps} />
        <img
          src={toUrl}
          alt=""
          className={[coverBase, runAnim ? 'feed-photo-commit-anim' : 'opacity-0'].filter(Boolean).join(' ')}
          style={slideVar}
          onAnimationEnd={(e) => {
            if (e.target !== e.currentTarget) return
            if (runAnim) onCommitAnimationEnd()
          }}
          {...toProps}
          ref={topRef}
        />
      </div>
    )
  }

  return (
    <div className="relative max-h-full max-w-full cursor-pointer">
      <img src={fromUrl} alt="" className={containBaseFlow} {...fromProps} />
      <img
        src={toUrl}
        alt=""
        className={[containOverlay, runAnim ? 'feed-photo-commit-anim' : 'opacity-0'].filter(Boolean).join(' ')}
        style={slideVar}
        onAnimationEnd={(e) => {
          if (e.target !== e.currentTarget) return
          if (runAnim) onCommitAnimationEnd()
        }}
        {...toProps}
        ref={topRef}
      />
    </div>
  )
}

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

    return (
      <IncomingCommitOverlay
        key={`${to}-${from}-${dir}-${toUrl}`}
        variant={variant}
        fromUrl={fromUrl}
        toUrl={toUrl}
        dir={dir}
        fromProps={propsFor(from)}
        toProps={propsFor(to)}
        coverBase={coverBase}
        containBaseFlow={containBaseFlow}
        containOverlay={containOverlay}
        onCommitAnimationEnd={finishTransition}
      />
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
