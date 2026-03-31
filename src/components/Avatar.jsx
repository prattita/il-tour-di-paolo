import { useState } from 'react'
import { AVATAR_PALETTE, avatarInitials, hashString } from '../lib/avatarDisplay'

/**
 * Profile image from `avatarUrl` when present and loadable; otherwise initials on a tinted circle.
 * @param {{ avatarUrl?: string | null, displayName?: string | null, email?: string | null, seed?: string, className?: string, alt?: string, imgClassName?: string, onImageClick?: (e: { stopPropagation: () => void }) => void, imageExpandAriaLabel?: string, onPhotoLoadError?: () => void }} props
 */
export function Avatar({
  avatarUrl,
  displayName,
  email = null,
  seed,
  className = 'h-9 w-9 text-[12px]',
  alt = '',
  imgClassName = 'h-full w-full object-cover',
  onImageClick = null,
  imageExpandAriaLabel = 'View larger',
  onPhotoLoadError = null,
}) {
  /** URL that last fired `onError`; reset when `avatarUrl` changes so a new token can load. */
  const [failedUrl, setFailedUrl] = useState(null)
  const showImg = Boolean(avatarUrl && failedUrl !== avatarUrl)
  const initials = avatarInitials(displayName, email)
  const palette = AVATAR_PALETTE[hashString(seed || displayName || email || 'x') % AVATAR_PALETTE.length]

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`.trim()}
    >
      {showImg ? (
        onImageClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onImageClick(e)
            }}
            className="h-full w-full min-h-0 min-w-0 cursor-zoom-in rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tour-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-tour-surface"
            aria-label={imageExpandAriaLabel}
          >
            <img
              src={avatarUrl}
              alt={alt}
              className={imgClassName}
              onError={() => {
                if (avatarUrl) setFailedUrl(avatarUrl)
                onPhotoLoadError?.()
              }}
            />
          </button>
        ) : (
          <img
            src={avatarUrl}
            alt={alt}
            className={imgClassName}
            onError={() => {
              if (avatarUrl) setFailedUrl(avatarUrl)
              onPhotoLoadError?.()
            }}
          />
        )
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center font-medium ${palette.bg} ${palette.text}`}
          aria-hidden
        >
          {initials}
        </span>
      )}
    </span>
  )
}
