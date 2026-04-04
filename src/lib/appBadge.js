/** @returns {boolean} */
export function supportsAppBadge() {
  return (
    typeof navigator !== 'undefined' &&
    'setAppBadge' in navigator &&
    typeof navigator.setAppBadge === 'function'
  )
}

/**
 * iOS Home Screen PWA: WebKit recommends notification permission for badges to show.
 * @returns {boolean}
 */
function badgePermissionOk() {
  if (typeof Notification === 'undefined') return true
  return Notification.permission === 'granted'
}

/**
 * @param {number} count — 0 clears the badge
 */
export async function setAppBadgeCount(count) {
  if (!supportsAppBadge()) return
  if (!badgePermissionOk()) return
  const n = Math.max(0, Math.floor(Number(count)) || 0)
  try {
    if (n > 0) {
      await navigator.setAppBadge(n)
    } else {
      await navigator.clearAppBadge()
    }
  } catch {
    // Unsupported or blocked — ignore
  }
}

export async function clearAppBadgeIfSupported() {
  if (!supportsAppBadge()) return
  try {
    await navigator.clearAppBadge()
  } catch {
    // ignore
  }
}
