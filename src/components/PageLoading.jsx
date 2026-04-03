import { useTranslation } from '../hooks/useTranslation'

/** Consistent inline loading row for Phase 10 polish (spinner + label). */
export function PageLoading({ label }) {
  const { t } = useTranslation()
  const text = label ?? t('common.loadingShort')
  return (
    <div
      className="flex items-center gap-2.5 py-6 text-sm text-tour-text-secondary"
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-tour-accent border-t-transparent"
        aria-hidden
      />
      <span>{text}</span>
    </div>
  )
}
