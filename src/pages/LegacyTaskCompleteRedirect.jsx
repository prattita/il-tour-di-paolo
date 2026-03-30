import { Navigate, useParams } from 'react-router-dom'

/** Redirect MVP path to canonical query URL (quick task completion spec). */
export function LegacyTaskCompleteRedirect() {
  const { groupId, activityId, taskId } = useParams()
  const qs = new URLSearchParams({ activityId, taskId }).toString()
  return <Navigate to={`/group/${groupId}/complete?${qs}`} replace />
}
