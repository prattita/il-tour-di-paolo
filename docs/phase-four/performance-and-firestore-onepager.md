# Performance & Firestore efficiency — Phase Four

> Status: **Planning** — Firestore/read work not yet implemented; **client bundle** (lazy routes) shipped  
> Last updated: April 2026  
> Parent doc: [DESIGN.md](../mvp/DESIGN.md)

**Scope:** This is the **only** optimization planning doc for the app (bundle size, Firestore reads, listeners, maintainability). Feature onepagers (e.g. [compound tasks](../phase-three/compoundTasks-onepager.md)) stay in their phase folders.

---

## Overview

**Il Tour di Paolo** is a small-audience app (~10 family members), but Firestore bills by **document reads** (and listeners charge per sync). Phase One–Three added features (profile pics, notifications, personal activities, compound tasks, feed interactions, etc.) that increase listeners, queries, and one-off `getDocs` paths.

This phase aims to:

1. **Reduce Firestore reads** where it is cheap to do so (client caching, fewer redundant queries, denormalized counters, pagination).
2. **Improve perceived performance and maintainability** (fewer duplicate subscriptions, clearer data ownership, predictable loading).
3. **Client JS bundle** — route-level code splitting where it helps (see **Client bundle** below).

**Non-goals for this phase:** rewriting the approval flow in Cloud Functions (see DESIGN §2 / §13 — separate initiative), tightening Storage rules, or large schema migrations unless a read win clearly justifies them.

---

## Client bundle — route code splitting (shipped)

**Problem:** `npm run build` warned that some chunks exceeded **500 kB** after minification (Vite default).

**Change:** `React.lazy()` + `Suspense` in `src/App.jsx` for route pages and `GroupLayout`, with `PageLoading` as the fallback. Smaller **initial** JS download; route code loads when first needed.

### Firestore impact

**None.** Lazy loading only affects **when JavaScript bundles are fetched and parsed**. It does **not** change how often the app calls `getDoc`, `getDocs`, `onSnapshot`, or write paths. Same components and hooks after load → same Firestore behavior.

### UX / product impact

| Area | Effect |
| --- | --- |
| **First visit to a route** | Browser may fetch that route’s chunk; user might see the `Suspense` fallback briefly on slow or cold loads. |
| **Repeat navigation** | Chunks are usually cached; feels the same as a single bundle after the first load. |
| **Pagination, submit, approve, reject, withdraw** | Unchanged — they run in code already loaded on that screen; no extra chunk fetches per action. |
| **Initial app open** | Tends to improve (less JS to parse on first paint) vs. one monolithic bundle. |

**Tradeoff:** occasional short spinner on **first** entry to a heavy route vs. lighter first load overall. Revisit if the fallback feels noisy (e.g. slimmer fallback without pulling large shared chunks, or prefetch on intent).

---

## How to approach the work

### 1. Start with **user journeys**, not folder order

Going **one source directory at a time** is a reasonable **execution** order for PRs, but the **discovery** order should be **journey-based** so you optimize what actually runs together:

| Journey | Typical routes / triggers | Why audit first |
| --- | --- | --- |
| Home & group pick | `/`, sign-in | `users/{uid}`, optional N× `groups/{gid}` (e.g. prune stale `groupIds`) |
| Enter group shell | `/group/:id/*` | Risk of **multiple** `onSnapshot` hooks for activities, members, enrollments, pending |
| Activities | `/group/:id/activities` | Heavy listener surface; compound tasks + visibility |
| Feed | `/group/:id/feed` | Real-time feed + comments subcollections on interaction |
| Owner badge / approvals | shell badge, `/approvals` | Per-group `getCountFromServer` loops |
| Settings / destructive ops | remove member, delete data | Full-collection `getDocs` patterns |

**Recommendation:** produce a short **read map** (spreadsheet or bullet list): *trigger → Firestore calls → doc count estimate*. Then implement fixes **by feature area** (`services/` + the pages that call them), using **directory passes** only as a checklist so nothing is forgotten.

### 2. Measure before and after

- Use **Firebase Console → Usage** (or Blaze billing detail) over a representative week, or add temporary logging in dev counting listener callbacks / `getDocs` result sizes.
- For local reasoning: **1 `getDoc` = 1 read**; **`getDocs` = 1 read per returned doc**; **`getCountFromServer` = 1 aggregation read** (charged; often cheaper than pulling all pending docs); **`onSnapshot` initial + each remote change** counts as reads.

### 3. Ship in small PRs

Each PR should target one journey or one service cluster, with a one-line note in the PR: *“Reduces X reads on Y screen by Z strategy.”*

---

## Known hotspots (from current repo patterns)

These are **candidates for review**, not a commitment to change every line.

| Area | File / pattern | Risk |
| --- | --- | --- |
| Owner pending count | `ownerPendingBadgeService.js` | For each `groupIds` entry: `getDoc(groups)` + `getCountFromServer(pending)` when user is owner — **O(owned groups)** round-trips per badge refresh |
| Stale group prune | `userService.pruneStaleGroupIdsFromUser` | **N `getDoc(groups)`** for N groups on home |
| Activity list | `activityService.js` | Multiple `onSnapshot` queries (standard vs advanced activities, members, enrollments, pending) — risk of **duplicate or overlapping** subscriptions if pages/hooks mount several |
| Remove member / cleanup | `groupSettingsService.js` | Broad `getDocs` over `pending`, `feed`, nested `comments` — **correct but expensive** at scale; worth **query narrowing** or **denormalized indices** if this path runs often |
| Home group list | `userService` + pages | Ensure group metadata is not re-fetched on every navigation if it could be cached per session |

---

## Strategy catalog (pick per hotspot)

### A. Denormalize small counters on `groups/{groupId}`

- Example: **`pendingCountForOwner`** or generic **`pendingCount`** maintained in batch when pending is created/deleted/approved/rejected (owner queue is the main consumer).
- **Tradeoff:** must keep writes in sync everywhere pending changes; add rules carefully; good for badge + shell UI.

### B. Single **group context** for the shell

- Provide activities + members + current user member doc + enrollment/personal-activity flags via **one React context** (or a tiny store) keyed by `groupId`, with **one subscription set** per group while the shell is mounted.
- **Tradeoff:** refactor cost; big win if multiple components currently subscribe independently.

### C. Pagination / limits on feed and comments

- Feed: `limit` + `startAfter` (or cursor) instead of unbounded listener if post count grows.
- Comments: load on expand or cap recent N.

### D. Replace full scans with targeted queries

- When deleting a member’s data, prefer **`where('userId', '==', uid)`** on `pending` (and any other collections keyed by user) over reading entire collections when rules allow.

### E. Client-side cache / deduplication

- Deduplicate concurrent `getDoc` for the same ref (simple in-flight promise map).
- Avoid re-subscribing on parent re-renders: stable `useEffect` deps, or move subscriptions to layout-level providers.

### F. Readability and performance together

- Co-locate **“who subscribes to what”** in one module per domain (`feedService`, `activityService`) and have pages call thin hooks — reduces double listeners and makes review easier.
- Add **short comments** only where non-obvious: e.g. why two queries exist (advanced vs standard activities).

---

## Suggested implementation checklist

- [x] **Route code splitting:** `App.jsx` lazy routes — clears Vite 500 kB warning; no Firestore impact (see **Client bundle** above).
- [ ] **Inventory:** Document per-journey Firestore calls (read map).
- [ ] **Shell / group entry:** Audit `GroupLayout` + hooks for duplicate `onSnapshot` on the same collections.
- [ ] **Owner badge:** Compare `getOwnerPendingSubmissionCount` vs denormalized counter on `groups` (or cached result with TTL in memory for non-owners).
- [ ] **Home:** `pruneStaleGroupIdsFromUser` — batch `getDoc` in parallel already if not; consider rate-limiting prune to once per session.
- [ ] **Destructive cleanup:** `groupSettingsService` — replace whole-collection reads with filtered queries where possible.
- [ ] **Feed / comments:** Add limits or lazy load for comment threads.
- [ ] **Regression:** Exercise join, submit, approve, reject, withdraw, remove member, add activity — counters and listeners must stay correct.

---

## Relation to other phase docs

- **Phase Two (notifications):** FCM and `users/{uid}` reads for tokens — keep token refresh paths from spamming Firestore.
- **Phase Two (personal activities) / Phase Three (compound):** More fields and listeners on `members` and activities; any **group-level cache** should include enrollment + compound counts to avoid N+1 patterns.

---

## Success criteria

- **Quantitative:** Meaningful drop in daily Firestore reads in Console for the same family usage pattern, or fewer listener attachments per group session (measured in dev).
- **Qualitative:** One place to look for “subscriptions for group X”; no known duplicate listener for the same query on a single screen; destructive flows do not scale reads linearly with total feed/post history when only a subset is relevant.

---

*After major wins land, update this doc’s **Status** to **Shipped** and link PRs or commit ranges in a short appendix.*
