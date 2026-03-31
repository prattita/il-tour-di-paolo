import { useLayoutEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * @param {unknown} el
 * @returns {el is HTMLElement}
 */
function isHTMLElement(el) {
  return el instanceof HTMLElement
}

/**
 * @param {HTMLElement} el
 */
function isLikelyVisible(el) {
  if (el.getAttribute('aria-hidden') === 'true') return false
  const s = window.getComputedStyle(el)
  if (s.display === 'none' || s.visibility === 'hidden') return false
  return true
}

/**
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
function getFocusableElements(container) {
  const nodes = container.querySelectorAll(FOCUSABLE_SELECTOR)
  const out = []
  for (const node of nodes) {
    if (isHTMLElement(node) && isLikelyVisible(node)) out.push(node)
  }
  return out
}

/**
 * Trap Tab / Shift+Tab inside the container while active; restore focus when deactivated.
 * @param {{ current: HTMLElement | null }} containerRef
 * @param {boolean} isActive
 */
export function useFocusTrap(containerRef, isActive) {
  const previousFocusRef = useRef(/** @type {HTMLElement | null} */ (null))

  useLayoutEffect(() => {
    if (!isActive) return undefined

    const prev = document.activeElement
    previousFocusRef.current = isHTMLElement(prev) ? prev : null

    const focusInitial = () => {
      const c = containerRef.current
      if (!c) return
      const focusables = getFocusableElements(c)
      focusables[0]?.focus()
    }

    const rafId = requestAnimationFrame(() => {
      focusInitial()
    })

    function onKeyDown(e) {
      if (e.key !== 'Tab') return
      const c = containerRef.current
      if (!c) return

      const focusables = getFocusableElements(c)
      if (focusables.length === 0) return

      const active = document.activeElement
      if (!isHTMLElement(active) || !c.contains(active)) {
        e.preventDefault()
        focusables[0]?.focus()
        return
      }

      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('keydown', onKeyDown, true)
      const toRestore = previousFocusRef.current
      previousFocusRef.current = null
      if (toRestore?.isConnected) {
        requestAnimationFrame(() => {
          toRestore.focus()
        })
      }
    }
  }, [isActive, containerRef])
}
