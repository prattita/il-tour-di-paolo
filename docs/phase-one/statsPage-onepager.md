# Stats Page & User Tracker — Feature Spec

> Status: Post-MVP
> Last updated: March 2026
> Parent doc: DESIGN.md

---

## Overview

A Stats page that ranks all group members by medals earned. Rankings are dynamic — recomputed on every approval. Introduces a reusable **User Tracker** component used in two places: the Stats page (full view) and the Feed top bar (compact scrollable strip).

---

## Ranking Algorithm

Members are ranked by medals using a strict priority sort — no ties. If two members share the same score at any level, the next medal tier breaks the tie.

### Sort order (descending priority)

1. Most gold medals
2. Most silver medals (tiebreaker)
3. Most bronze medals (tiebreaker)
4. Earliest to reach current score (final tiebreaker — `joinedAt` timestamp)

### Example

| User | Gold | Silver | Bronze | Rank |
|---|---|---|---|---|
| Paolo | 1/3 | 2/3 | 2/3 | 1st |
| Marco | 0/3 | 2/3 | 2/3 | 2nd |
| Giulia | 0/3 | 2/3 | 1/3 | 3rd |
| Luca | 0/3 | 0/3 | 0/3 | 4th |

If Marco earns a gold medal, he ties Paolo on gold (1/3 each). Silver count then breaks the tie — both have 2/3 silver, so bronze count applies — both have 2/3 bronze. Final tiebreaker is `joinedAt` — whoever joined the group first ranks higher. Marco does not overtake Paolo until he has a strictly higher medal score at some level.

### Ranking computation

Rankings are computed **client-side** from the `members` subcollection on every render. No separate rank field stored in Firestore — derived state only. Recomputes automatically as Firestore listeners push progress updates.

```javascript
const rankMembers = (members) =>
  [...members].sort((a, b) => {
    const medals = (m) => ({
      gold:   Object.values(m.progress).filter(p => p.tasksCompleted === 3).length,
      silver: Object.values(m.progress).filter(p => p.tasksCompleted === 2).length,
      bronze: Object.values(m.progress).filter(p => p.tasksCompleted === 1).length,
    })
    const ma = medals(a), mb = medals(b)
    if (mb.gold   !== ma.gold)   return mb.gold   - ma.gold
    if (mb.silver !== ma.silver) return mb.silver - ma.silver
    if (mb.bronze !== ma.bronze) return mb.bronze - ma.bronze
    return a.joinedAt - b.joinedAt  // earliest joiner wins final tie
  })
```

---

## User Tracker Component

A reusable component that displays a single member's rank, avatar, name, and medal summary. Used in two contexts with different layouts.

### Props

```typescript
interface UserTrackerProps {
  user: {
    userId: string
    displayName: string
    avatarUrl: string | null
    progress: Record<string, { tasksCompleted: number }>
  }
  rank: number               // 1-based position in ranked list
  variant: "full" | "compact"
  isCurrentUser?: boolean    // highlights the logged-in user
  totalActivities: number    // for N/N medal display
}
```

### Full variant — Stats page

```
┌────────────────────────────────┐
│  1st  [avatar]  Paolo R.       │
│               🥇 1/3  🥈 2/3  🥉 2/3  │
└────────────────────────────────┘
```

- Rank number left-aligned, bold
- Avatar (initials fallback)
- Display name
- Medal summary: gold N/N · silver N/N · bronze N/N
- Current user row highlighted with a subtle background tint
- Tapping a row navigates to that user's profile

### Compact variant — Feed top bar

```
 [avatar]    [avatar]    [avatar]
  Paolo       Marco       Giulia
   1st         2nd         3rd
```

- Avatar only + display name + rank position
- Horizontally scrollable strip
- Tapping an avatar navigates to that user's profile
- Current user's chip has a subtle border highlight

---

## Stats Page

Accessible from the burger menu for all group members.

### Layout

```
┌─────────────────────────────┐
│  ≡        Standings      PR │  ← standard top nav
├─────────────────────────────┤
│  Il Tour di Paolo 2026      │  ← group name subheader
│  4 members · 4 activities   │
├─────────────────────────────┤
│  1st  [PR]  Paolo R.        │
│             🥇 1/3  🥈 2/3  🥉 2/3  │  ← highlighted (current user)
├─────────────────────────────┤
│  2nd  [MR]  Marco R.        │
│             🥇 0/3  🥈 2/3  🥉 2/3  │
├─────────────────────────────┤
│  3rd  [GF]  Giulia F.       │
│             🥇 0/3  🥈 2/3  🥉 1/3  │
├─────────────────────────────┤
│  4th  [LR]  Luca R.         │
│             🥇 0/3  🥈 0/3  🥉 0/3  │
└─────────────────────────────┘
```

- All members shown in rank order, no pagination needed at family scale
- Current user row always highlighted regardless of position
- Tapping any row navigates to that user's profile
- Rankings update in real-time via existing Firestore `members` listener — no additional listener needed

---

## Feed Top Bar

A horizontally scrollable strip of compact User Tracker chips sits between the top nav and the first feed post. Shows all members in rank order.

```
┌─────────────────────────────────────────────┐
│  ≡              Feed                     PR  │
├─────────────────────────────────────────────┤
│  [PR]   [MR]   [GF]   [LR]   →  scrollable  │
│  Paolo  Marco  Giulia  Luca                  │
│   1st    2nd    3rd    4th                   │
├─────────────────────────────────────────────┤
│  feed posts below...                         │
```

- Horizontally scrollable, does not push feed posts down when scrolled
- Sticky at the top — stays visible as user scrolls the feed
- Same real-time ranking as the Stats page — both read from the same `members` listener
- Tapping a chip navigates to that user's profile
- Strip is always visible on the Feed screen — not collapsible for MVP

---

## Data Requirements

No new Firestore reads needed. Rankings are derived entirely from the existing `groups/{groupId}/members` real-time listener already established for the feed. The `rankMembers()` function runs client-side on every listener update.

The only new field required is `joinedAt` on the member document — already part of the existing data model.

---

## Burger Menu Update

Add "Standings" to the burger menu navigation for all members:

```
Feed
Activities
Group Info
Profile
Standings          ← new
──────────────
Approval Queue     [Owner]
Group Settings     [Owner]
──────────────
Settings
Sign out
```

---

## Implementation Checklist

- [ ] Build `UserTracker` component with `full` and `compact` variants
- [ ] Implement `rankMembers()` sort function with gold → silver → bronze → joinedAt priority
- [ ] Build Stats page with full UserTracker list
- [ ] Highlight current user row on Stats page
- [ ] Add "Standings" to burger menu for all members
- [ ] Build horizontally scrollable compact UserTracker strip for Feed top bar
- [ ] Make Feed strip sticky below top nav
- [ ] Wire both views to existing `members` Firestore listener — no new listeners needed
- [ ] Tap on UserTracker navigates to that user's profile in both contexts
- [ ] Update burger menu mock in UI_MOCKUPS

---

## Rejected Alternatives

| Approach | Why rejected |
|---|---|
| Store rank in Firestore | Derived state — unnecessary write on every approval, client sort is sufficient at this scale |
| Separate Firestore listener for stats | Not needed — `members` subcollection already contains all required data |
| Collapsible feed strip | Adds interaction complexity — always visible is simpler for MVP |
| Top 3 only on feed strip | All members preferred — family scale makes full list appropriate and fun |