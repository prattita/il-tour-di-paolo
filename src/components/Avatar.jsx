import { useState } from 'react'
import { AVATAR_PALETTE, avatarInitials, hashString } from '../lib/avatarDisplay'

/**
 * Profile image from `avatarUrl` when present and loadable; otherwise initials on a tinted circle.
 * @param {{ avatarUrl?: string | null, displayName?: string | null, email?: string | null, seed?: string, className?: string, alt?: string, imgClassName?: string }} props
 */
export function Avatar({
  avatarUrl,
  displayName,
  email = null,
  seed,
  className = 'h-9 w-9 text-[12px]',
  alt = '',
  imgClassName = 'h-full w-full object-cover',
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
        <img
          src={avatarUrl}
          alt={alt}
          className={imgClassName}
          onError={() => {
            if (avatarUrl) setFailedUrl(avatarUrl)
          }}
        />
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
