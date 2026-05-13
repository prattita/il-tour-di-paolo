# Performance & Firestore efficiency — Phase Four

> Status: **In progress** — **Shipped:** auth single-read bootstrap, home `loadUserGroupsForHome`, eager `HomePage` + aligned route loaders. **Open:** shell/listener audit, owner badge, destructive cleanup, feed/comments limits, read-map inventory (see [Work shipped](#work-shipped) / [Work pending](#work-pending)).
> Last updated: May 2026  
> Parent doc: [DESIGN.md](../mvp/DESIGN.md)

**Scope:** This is the **only** optimization planning doc for the app (bundle size, Firestore reads, listeners, maintainability). Feature onepagers (e.g. [compound tasks](../phase-three/compoundTasks-onepager.md)) stay in their phase folders.

**Quick links:** [Work shipped](#work-shipped) · [Work pending](#work-pending)

---

<a id="work-shipped"></a>

## Work shipped (Phase Four — to date)

| Area | What changed | Where |
| --- | --- | --- |
| **Auth bootstrap** | One `getDoc(users/{uid})` on sign-in; create-or-patch `notifications` in a single flow | `ensureUserDocumentOnAuth` in `src/services/userService.js`; `src/context/AuthProvider.jsx` |
| **Home group list** | One user read; parallel `getDoc(groups/{gid})`; list built from snapshots; batched `arrayRemove` for stale ids; `pruneStaleGroupIdsFromUser` delegates | `loadUserGroupsForHome` in `src/services/userService.js`; `src/pages/HomePage.jsx` |
| **Client bundle (baseline)** | Route-level `React.lazy` + `Suspense` to avoid a monolithic bundle | `src/App.jsx` (all routes except home were lazy from the original split) |
| **Landing + loaders (Phase C)** | Eager `HomePage` for `/`; fullscreen `PageLoading` for auth gates and `Suspense` | `src/App.jsx`, `src/components/PageLoading.jsx`, `src/components/ProtectedRoute.jsx`, `src/components/PublicOnlyRoute.jsx` |

**Intentionally not shipped:** clearing auth `loading` before Firestore profile ensure finishes (“Phase A part 2”) — avoids `users/{uid}` `setDoc` vs join `merge` races without extra write-model work ([Auth bootstrap](#auth-bootstrap-phase-four) below).

---

<a id="work-pending"></a>

## Work pending

| Priority | Item | Notes |
| --- | --- | --- |
| Discovery | **Read map / inventory** — document per-journey Firestore calls | Checklist; unblocks prioritizing remaining hotspots |
| Shell | **Group entry** — audit `GroupLayout` + hooks for duplicate `onSnapshot` on the same collections | [Known hotspots](#known-hotspots-from-current-repo-patterns) |
| Reads | **Owner pending badge** — `getDoc` + `getCountFromServer` per owned group vs denormalized counter or TTL cache | `ownerPendingBadgeService.js` |
| Reads | **Destructive cleanup** — narrow `getDocs` in `groupSettingsService` with targeted queries where rules allow | Member removal / cleanup paths |
| UX / reads | **Feed / comments** — caps, lazy comment threads, pagination if post volume grows | `feedService`, feed UI |
| QA | **Regression pass** — join, submit, approve, reject, withdraw, remove member, add activity | Ongoing; not a code deliverable in this doc |
| Optional | **Rate-limit home prune** — e.g. `localStorage` throttle + manual refresh | [Home group list](#home-group-list-phase-four) |

Strategy catalog items ([below](#strategy-catalog-pick-per-hotspot)) remain **reference patterns** for the pending rows, not all committed work.

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

**Update (Phase C):** `HomePage` is **imported statically** (default `/` after sign-in) so the first protected paint does not wait on a separate chunk for home. Other routes stay lazy. **`PageLoading` `layout="fullscreen"`** is used for `Suspense`, `ProtectedRoute`, and `PublicOnlyRoute` so auth wait and route chunk load share the same spinner + `tour-muted` full-screen shell as the rest of the app (replacing ad hoc slate placeholders).

### Firestore impact

**None.** Lazy loading only affects **when JavaScript bundles are fetched and parsed**. It does **not** change how often the app calls `getDoc`, `getDocs`, `onSnapshot`, or write paths. Same components and hooks after load → same Firestore behavior.

### UX / product impact

| Area | Effect |
| --- | --- |
| **First visit to a route** | Browser may fetch that route’s chunk; user might see the `Suspense` fallback briefly on slow or cold loads. |
| **Repeat navigation** | Chunks are usually cached; feels the same as a single bundle after the first load. |
| **Pagination, submit, approve, reject, withdraw** | Unchanged — they run in code already loaded on that screen; no extra chunk fetches per action. |
| **Initial app open** | Tends to improve (less JS to parse on first paint) vs. one monolithic bundle; home route code is in the main graph so `/` after auth avoids an extra home chunk fetch. |

**Tradeoff:** occasional short spinner on **first** entry to a **lazy** route vs. lighter first load overall; home pays a small one-time cost in the main bundle to skip its own chunk. Revisit if the fallback feels noisy (e.g. prefetch on intent).

---

## How to approach the work

### 1. Start with **user journeys**, not folder order

Going **one source directory at a time** is a reasonable **execution** order for PRs, but the **discovery** order should be **journey-based** so you optimize what actually runs together:

| Journey | Typical routes / triggers | Why audit first |
| --- | --- | --- |
| Home & group pick | `/`, sign-in | **Shipped:** `ensureUserDocumentOnAuth`, `loadUserGroupsForHome`; optional prune rate-limit still open |
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

These are **candidates for review**; some home/auth items are **done** (see [Work shipped](#work-shipped-phase-four--to-date)).

| Area | File / pattern | Risk |
| --- | --- | --- |
| Owner pending count | `ownerPendingBadgeService.js` | For each `groupIds` entry: `getDoc(groups)` + `getCountFromServer(pending)` when user is owner — **O(owned groups)** round-trips per badge refresh |
| Stale group prune / home groups | `userService.loadUserGroupsForHome` | **Shipped:** one `getDoc(users)`, parallel `getDoc(groups)`, reuse snapshots for list, batched `arrayRemove` for stale ids |
| Activity list | `activityService.js` | Multiple `onSnapshot` queries (standard vs advanced activities, members, enrollments, pending) — risk of **duplicate or overlapping** subscriptions if pages/hooks mount several |
| Remove member / cleanup | `groupSettingsService.js` | Broad `getDocs` over `pending`, `feed`, nested `comments` — **correct but expensive** at scale; worth **query narrowing** or **denormalized indices** if this path runs often |
| Home group list | `HomePage` → `loadUserGroupsForHome` | **Shipped** — see row above; optional: session cache / rate-limit prune |

---

<a id="home-auth-read-latency-optimizations"></a>

## Home & auth — latency optimizations (reference)

This section records **what was implemented** for **opening the app** and **loading the group list on `/`**, plus optional follow-ups. Broader Phase Four backlog is in [Work pending](#work-pending).

<a id="auth-bootstrap-phase-four"></a>

### Auth bootstrap (`AuthProvider` + `ensureUserDocumentOnAuth`)

**Problem (historical):** `onAuthStateChanged` awaited `ensureUserProfile` and `ensureNotificationDefaults`, each doing `getDoc(users/{uid})` **sequentially** before `setUser` / `setLoading(false)` — doubling round-trip latency on the same document.

**Implemented:** `ensureUserDocumentOnAuth` in `userService.js` performs **one** `getDoc`, then either `setDoc` (new user, full shape including `notifications`), `updateDoc` (legacy doc missing `notifications`), or no write. `AuthProvider` calls only this helper. `ensureUserProfile` and `ensureNotificationDefaults` remain exported for other call sites and match the same default payload shape as before.

**Not implemented (optional):** Clearing auth `loading` before Firestore ensure completes — only adopt if join and other flows do not assume `users/{uid}` exists before first write.

<a id="home-group-list-phase-four"></a>

### Home group list (`HomePage` + `loadUserGroupsForHome`)

**Problems (historical):** Redundant `getDoc(users/{uid})`, **serialized** `getDoc(groups/{gid})` in prune, then **`getGroupsByIds`** re-fetched the same group docs; stale removals used **one `updateDoc` per stale id**.

**Implemented:** `loadUserGroupsForHome(uid)` in `userService.js` — one user read, **`Promise.all`** group reads, build the list from those snapshots, **`arrayRemove(...stale)`** in a single `updateDoc` when needed. `HomePage` calls only this. `pruneStaleGroupIdsFromUser` delegates to it when Firestore is available (same behavior for self-heal notes in `groupSettingsService`).

**Optional later:**

- **Rate-limit prune** — e.g. skip full pass when `lastGroupPruneAt` in `localStorage` is recent; still run on manual refresh or version bump.

<a id="bundle-route-loading"></a>

### Bundle / route loading (`App.jsx` + `PageLoading`)

**Problems (historical):** `HomePage` was lazy — after auth, users could see `ProtectedRoute` loading, then a `Suspense` fetch for the home chunk. Auth gates used a **slate** full-screen message while `Suspense` used **`PageLoading`** (tour accent spinner), so back-to-back states felt inconsistent.

**Implemented:** Static import of **`HomePage`** in `App.jsx` for `/`. **`PageLoading`** supports **`layout="fullscreen"`** (centered `min-h-dvh`, `bg-tour-muted`, same spinner row); used by **`Suspense`**, **`ProtectedRoute`**, and **`PublicOnlyRoute`**. Inline `PageLoading` (sections inside pages) unchanged.

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
- [ ] **Inventory:** Document per-journey Firestore calls (read map) — see [Work pending](#work-pending).
- [ ] **Shell / group entry:** Audit `GroupLayout` + hooks for duplicate `onSnapshot` on the same collections.
- [ ] **Owner badge:** Compare `getOwnerPendingSubmissionCount` vs denormalized counter on `groups` (or cached result with TTL in memory for non-owners).
- [x] **Auth bootstrap:** Single `getDoc` on sign-in via `ensureUserDocumentOnAuth` (`src/services/userService.js`, `src/context/AuthProvider.jsx`).
- [x] **Home group list:** `loadUserGroupsForHome` (`src/services/userService.js`) + `HomePage`; parallel reads, batched stale removal; `pruneStaleGroupIdsFromUser` delegates.
- [x] **Bundle / route UX:** Eager `HomePage` for `/`; `PageLoading layout="fullscreen"` for `Suspense`, `ProtectedRoute`, and `PublicOnlyRoute` ([Bundle / route loading](#bundle-route-loading)).
- [ ] **Destructive cleanup:** `groupSettingsService` — replace whole-collection reads with filtered queries where possible.
- [ ] **Feed / comments:** Add limits or lazy load for comment threads.
- [ ] **Regression:** Exercise join, submit, approve, reject, withdraw, remove member, add activity — counters and listeners must stay correct.

---

## Relation to other phase docs

- **Phase Two (notifications):** FCM and `users/{uid}` reads for tokens — keep token refresh paths from spamming Firestore.
- **Phase Two (personal activities) / Phase Three (compound):** More fields and listeners on `members` and activities; any **group-level cache** should include enrollment + compound counts to avoid N+1 patterns.

---

## Success criteria

- **Quantitative (partial):** Home/auth path should show fewer reads per session for the same usage (single user read on sign-in; one user read + parallel group reads on `/`). Confirm in Firebase Console when convenient.
- **Quantitative (remaining):** Meaningful drop in daily reads for **group shell, badge, cleanup, feed** once those items in [Work pending](#work-pending) ship.
- **Qualitative:** One place to look for “subscriptions for group X”; no known duplicate listener for the same query on a single screen; destructive flows do not scale reads linearly with total feed/post history when only a subset is relevant.

---

*Phase Four remains **in progress** until shell/badge/cleanup/feed items are addressed or explicitly deferred; then update **Status** to **Shipped** (or **Paused**) and add a short appendix with PR / date range if useful.*
