/** Current medal tier from approved task count (0–3) for an activity. */
export function medalTierFromTasksCompleted(tasksCompleted) {
  const n = Math.min(3, Math.max(0, Number(tasksCompleted) || 0))
  if (n >= 3) return 'gold'
  if (n >= 2) return 'silver'
  if (n >= 1) return 'bronze'
  return 'none'
}
