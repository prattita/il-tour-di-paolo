/**
 * Task UI state per DESIGN §7.4–7.5 (current user only).
 * @param {{ id: string }} task
 * @param {{ completedTaskIds?: string[] } | null | undefined} [activityProgress] members/{uid}.progress[activityId]
 * @param {{ taskId?: string } | null | undefined} pendingDoc
 * @returns {'approved' | 'pending' | 'blocked' | 'empty'}
 */
export function getTaskStatus(task, activityProgress, pendingDoc) {
  const completed = activityProgress?.completedTaskIds || []
  if (completed.includes(task.id)) return 'approved'
  if (!pendingDoc) return 'empty'
  if (pendingDoc.taskId === task.id) return 'pending'
  return 'blocked'
}
