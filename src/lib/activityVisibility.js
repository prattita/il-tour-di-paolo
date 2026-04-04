/**
 * Activities tab & completion picker: who may **participate** in the list (Complete, counters, etc.).
 * Personal: **assignee only** — the owner does not see others’ personal rows here even though they
 * manage them in Group settings / see roster in Group info (`GroupInfoPage` uses its own owner rule).
 * Firestore may still return personal docs to all members (read for profile/feed); this filter is UI.
 */
export function activityVisibleOnParticipationSurfaces(activity, viewerUid, _ownerId) {
  if (!activity || !viewerUid) return false
  if (activity.isPersonal === true) {
    return typeof activity.assignedUserId === 'string' && activity.assignedUserId === viewerUid
  }
  return true
}

/** Profile: subject participates in standard + enrolled advanced + personal assigned to them only. */
export function filterActivitiesForSubjectProfile(activities, subjectUserId) {
  return (activities || []).filter((a) => {
    if (a.isAdvanced === true) return true
    if (a.isPersonal === true) {
      return typeof a.assignedUserId === 'string' && a.assignedUserId === subjectUserId
    }
    return true
  })
}
