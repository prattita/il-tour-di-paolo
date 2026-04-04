import { getCompoundTarget, getCompoundCount, isCompoundTask, isCompoundReadyToSubmit } from './compoundTask'
import { getTaskStatus } from './taskStatus'

/**
 * Per DESIGN §5 `selectedActivityIds`: null/undefined = all activities; [] = none; else subset.
 * @param {{ selectedActivityIds?: string[] | null } | null | undefined} member
 * @param {string} activityId
 */
export function memberParticipatesInActivity(member, activityId) {
  const sel = member?.selectedActivityIds
  if (sel == null) return true
  if (Array.isArray(sel) && sel.length === 0) return false
  return Array.isArray(sel) && sel.includes(activityId)
}

/**
 * Activity appears in FAB / picker list: user participates, no pending for activity, not all tasks approved, at least one task submittable.
 */
export function isActivityEligibleForCompletionPicker(activity, member, pendingDoc) {
  if (!activity?.id || !memberParticipatesInActivity(member, activity.id)) return false
  if (pendingDoc) return false
  const progress = member?.progress?.[activity.id]
  const tasks = activity.tasks || []
  if (tasks.length === 0) return false
  const allApproved = tasks.every((t) => getTaskStatus(t, progress, null) === 'approved')
  if (allApproved) return false
  return tasks.some((t) => {
    if (getTaskStatus(t, progress, null) !== 'empty') return false
    if (isCompoundTask(t)) {
      const y = getCompoundTarget(t)
      const x = getCompoundCount(member, activity.id, t.id)
      return x === y
    }
    return true
  })
}

/** Alphabetically by activity name (stable tie-break on id). */
export function sortActivitiesByName(activities) {
  return [...activities].sort((a, b) => {
    const na = (a.name || '').toLowerCase()
    const nb = (b.name || '').toLowerCase()
    if (na !== nb) return na.localeCompare(nb)
    return a.id.localeCompare(b.id)
  })
}

/**
 * Tasks the user can submit from picker for this activity (in array order).
 */
export function getEligibleTasksForPicker(activity, member, pendingDoc) {
  if (!activity?.tasks?.length) return []
  const progress = member?.progress?.[activity.id]
  return activity.tasks.filter((t) => {
    if (getTaskStatus(t, progress, pendingDoc) !== 'empty') return false
    if (isCompoundTask(t)) return isCompoundReadyToSubmit(t, progress, pendingDoc, member, activity.id)
    return true
  })
}

export function hasAnyEligibleCompletionActivity(activities, member, pendingByActivityId) {
  if (!activities?.length || !member) return false
  return activities.some((a) =>
    isActivityEligibleForCompletionPicker(a, member, pendingByActivityId[a.id] ?? null),
  )
}
