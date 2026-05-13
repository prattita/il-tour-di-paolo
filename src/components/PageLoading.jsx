import { useTranslation } from '../hooks/useTranslation'

const spinnerClass =
  'inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-tour-accent border-t-transparent'

/** Consistent loading UI: default inline row; `fullscreen` for auth gate + `Suspense` (matches tour shell colors). */
export function PageLoading({ label, layout = 'inline' }) {
  const { t } = useTranslation()
  const text = label ?? t('common.loadingShort')
  const inner = (
    <>
      <span className={spinnerClass} aria-hidden />
      <span>{text}</span>
    </>
  )
  if (layout === 'fullscreen') {
    return (
      <div
        className="flex min-h-dvh items-center justify-center bg-tour-muted text-tour-text"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2.5 text-sm text-tour-text-secondary">{inner}</div>
      </div>
    )
  }
  return (
    <div
      className="flex items-center gap-2.5 py-6 text-sm text-tour-text-secondary"
      role="status"
      aria-live="polite"
    >
      {inner}
    </div>
  )
}
