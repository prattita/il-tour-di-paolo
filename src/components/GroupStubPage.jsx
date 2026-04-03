import { Link, useParams } from 'react-router-dom'
import { useTranslation } from '../hooks/useTranslation'

export function GroupStubPage({ title, phaseLabel, detail }) {
  const { groupId } = useParams()
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-lg font-medium text-tour-text">{title}</h1>
      <p className="mt-2 text-sm text-tour-text-secondary">
        {detail || t('stub.shipsInPhase', { phase: phaseLabel })}
      </p>
      <Link
        to={`/group/${groupId}/feed`}
        className="mt-4 inline-block rounded-lg border border-black/10 bg-tour-surface px-3 py-1.5 text-sm font-medium text-tour-text hover:bg-tour-muted"
      >
        {t('taskComplete.backToFeed')}
      </Link>
    </div>
  )
}
