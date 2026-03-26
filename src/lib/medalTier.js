/** Current medal tier from approved task count (0–3) for an activity. */
export function medalTierFromTasksCompleted(tasksCompleted) {
  const n = Math.min(3, Math.max(0, Number(tasksCompleted) || 0))
  if (n >= 3) return 'gold'
  if (n >= 2) return 'silver'
  if (n >= 1) return 'bronze'
  return 'none'
}

/**
 * Per-activity inclusive counts: gold tier counts toward gold, silver, and bronze;
 * silver toward silver and bronze; bronze toward bronze only.
 */
export function inclusiveMedalCounts(activities, progress) {
  let gold = 0
  let silver = 0
  let bronze = 0
  for (const a of activities) {
    const n = progress?.[a.id]?.tasksCompleted ?? 0
    const tier = medalTierFromTasksCompleted(n)
    if (tier === 'gold') {
      gold += 1
      silver += 1
      bronze += 1
    } else if (tier === 'silver') {
      silver += 1
      bronze += 1
    } else if (tier === 'bronze') {
      bronze += 1
    }
  }
  return { gold, silver, bronze }
}
