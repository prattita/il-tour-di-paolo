/**
 * Compound tasks — track x/y on the honor system, then one photo submission at x === y.
 * @see docs/phase-three/compoundTasks-onepager.md
 */

export const COMPOUND_TARGET_MIN = 1
export const COMPOUND_TARGET_MAX = 100

/** @param {unknown} task */
export function isCompoundTask(task) {
  return task?.kind === 'compound' && getCompoundTarget(task) != null
}

/** @param {unknown} task */
export function getCompoundTarget(task) {
  if (task?.kind !== 'compound') return null
  const y = Number(task?.targetCount)
  if (!Number.isFinite(y) || y < COMPOUND_TARGET_MIN || y > COMPOUND_TARGET_MAX) return null
  return Math.floor(y)
}

/**
 * Current count x from `members/{uid}.compoundProgress` (not medal progress).
 * @param {{ compoundProgress?: Record<string, Record<string, number>> } | null | undefined} member
 * @param {string} activityId
 * @param {string} taskId
 */
export function getCompoundCount(member, activityId, taskId) {
  const raw = member?.compoundProgress?.[activityId]?.[taskId]
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

/**
 * @param {unknown} task
 * @param {{ completedTaskIds?: string[] } | null | undefined} activityProgress
 * @param {{ taskId?: string } | null | undefined} pendingDoc
 */
export function isCompoundCounterFrozen(task, activityProgress, pendingDoc) {
  if (!isCompoundTask(task)) return true
  if (activityProgress?.completedTaskIds?.includes(task.id)) return true
  if (pendingDoc?.taskId === task.id) return true
  return false
}

/**
 * Member may use Complete (navigate / submit) for this compound task.
 * @param {unknown} task
 * @param {{ completedTaskIds?: string[] } | null | undefined} activityProgress
 * @param {{ taskId?: string } | null | undefined} pendingDoc
 * @param {{ compoundProgress?: Record<string, Record<string, number>> } | null | undefined} member
 * @param {string} activityId
 */
export function isCompoundReadyToSubmit(task, activityProgress, pendingDoc, member, activityId) {
  if (!isCompoundTask(task)) return true
  const y = getCompoundTarget(task)
  const x = getCompoundCount(member, activityId, task.id)
  if (x !== y) return false
  if (pendingDoc) return false
  return true
}

/**
 * Clamp target for forms.
 * @param {unknown} raw
 */
export function normalizeCompoundTargetInput(raw) {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw)
  if (!Number.isFinite(n)) return COMPOUND_TARGET_MIN
  return Math.min(COMPOUND_TARGET_MAX, Math.max(COMPOUND_TARGET_MIN, Math.floor(n)))
}
