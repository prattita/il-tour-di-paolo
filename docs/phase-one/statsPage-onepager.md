# Stats Page & User Tracker — Feature Spec

> Status: Phase One (post-MVP)  
> Last updated: March 2026  
> Parent doc: [DESIGN.md](../mvp/DESIGN.md)

---

## Overview

A **Standings** screen ranks all group members by medals earned. Rankings are **derived client-side** from the existing **`members`** subcollection (plus **`activities`** for denominators) — no rank field in Firestore.

A reusable **User Tracker** appears in two places:

1. **Standings page** — full rows with medal **N/N** summary (aligned with the profile screen).
2. **Feed** — compact, horizontally scrollable **strip**, **sticky** below the group shell header while the feed scrolls.

---

## Alignment with DESIGN.md

| Topic | DESIGN / app today | This feature |
| --- | --- | --- |
| Nav shell | §6.1 — **no** separate “Profile” row; profile via user block + top avatar | Add **Standings** only; do **not** add a duplicate Profile link. |
| `joinedAt` on members | §5 `members` doc | Tiebreaker sort must use Firestore **Timestamp** (`toMillis()`), not numeric subtraction on raw objects. |
| Medal semantics | Profile uses **`inclusiveMedalCounts`** ([`medalTier.js`](../../src/lib/medalTier.js)) | **Same** counts for ranking **and** display so Standings matches Profile. |
| `selectedActivityIds` | Fast-follow participation filter | Until join UI ships, count **all** activities in the group. Then intersect with participation (same as Activities tab). |
| Feed content | §6.2 — metadata on Group Info, not Feed | Strip is **only** standings chips; no invite code / counts on Feed beyond this. |

---

## Ranking algorithm

Sort **descending** by:

1. **Gold count** — activities with **3** approved tasks (`inclusiveMedalCounts` gold bucket = count of full-gold activities only; same as profile “Gold N/N”).
2. **Silver count** — inclusive silver tier total (profile-consistent).
3. **Bronze count** — inclusive bronze tier total.
4. **`joinedAt`** — **earlier** join wins (stable, deterministic “no ties” at family scale).

Implementation: `rankMembersForStandings(members, activities)` in `src/lib/standingsRank.js` using **`inclusiveMedalCounts(activities, member.progress)`** and **`joinedAtMillis(member)`**.

---

## User Tracker component

### Props (conceptual)

- **`member`** — `{ id, displayName, avatarUrl, progress, joinedAt }` from `members` docs.
- **`rank`** — 1-based index after sort.
- **`variant`** — `"full"` | `"compact"`.
- **`isCurrentUser`** — subtle highlight (row tint or chip ring).
- **`activities`** — same list as profile / activities (for **`inclusiveMedalCounts`** and **N** denominator = `activities.length`).
- **`groupId`** — for links to **`/group/:groupId/profile/:memberId`**.

### Full variant (Standings page)

- Ordinal label (**1st**, **2nd**, …), **`Avatar`**, display name, medal summary **Gold N/N · Silver N/N · Bronze N/N** (reuse **`MedalBadge`** + tabular text like profile).
- Row is a **`Link`** to that member’s profile.
- Current user row: muted accent background.

### Compact variant (Feed strip)

- **`Avatar`**, truncated name, ordinal below or beside.
- Horizontal **`overflow-x-auto`**; all members at family scale.
- Current user: **`ring-tour-accent`** (or equivalent).
- **`Link`** to profile per chip.

---

## Standings page

- **Route:** `/group/:groupId/standings` (nested under **`GroupLayout`**).
- **Title (shell):** “Standings”.
- **Content:** Optional subheader — group name, **`{memberCount} members · {activities.length} activities`** (or `group.activityCount` if activities snapshot empty; prefer live activities length when loaded).
- **List:** ranked **`UserTracker`** `full` rows; real-time via **`subscribeGroupMembers`** + **`subscribeActivities`**.

---

## Feed strip

- Placed **at the top of the feed page content** (after the shell header), **`sticky top-0`** inside the scrolling **`<main>`** so it stays visible while scrolling posts.
- Same rank order as Standings — derive from **`subscribeGroupMembers`** + **`subscribeActivities`** (feed already pulls **activities** via completion hook; avoid duplicate listeners where one subscription can feed both FAB eligibility and standings, or accept two **`subscribeActivities`** if simpler).

---

## Navigation

Add **Standings** for **all members**:

- **Drawer + desktop sidebar:** after **Group Info**, before the owner divider (owner links unchanged).
- **Not** listed: standalone “Profile” (see §6.1).

---

## Data & listeners

- **No** new collections; **no** stored rank.
- **Standings page:** `subscribeGroupMembers` + `subscribeActivities`.
- **Feed:** add **`subscribeGroupMembers`** if not already present; reuse **activities** from existing hook when possible.

---

## Implementation checklist

- [x] `standingsRank.js` — `joinedAtMillis`, `rankMembersForStandings` (inclusive medals + join tiebreaker)
- [x] `UserTracker.jsx` — `full` + `compact`
- [x] `GroupStandingsPage.jsx` + route `standings`
- [x] **Standings** in `GroupLayout` nav + shell title map
- [x] Feed: sticky compact strip + links
- [x] Update **DESIGN.md** §6 route table when shipped

---

## Rejected alternatives

| Approach | Why |
| --- | --- |
| Store rank in Firestore | Derived; extra writes on every approval |
| Exclusive-only medal counts for sort | Diverges from profile **`inclusiveMedalCounts`** |
| Top 3 only on feed | Spec prefers full family list at small scale |
| Collapsible strip | Defer complexity |

---

## Related

- Feed filters / pagination / likes: [groupfeedpagev2-onepager.md](./groupfeedpagev2-onepager.md) (later).
