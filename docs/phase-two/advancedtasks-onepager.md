# Advanced Activities — Feature Spec
 
> Status: **Phase Two — shipped** (implementation in repo; deploy rules + indexes)
> Last updated: March 2026
> Parent doc: DESIGN.md
> Author: Paolo
 
---
 
## Overview
 
Advanced activities are **optional, hidden activities** that a member can unlock and enroll in by earning a **gold medal** on a designated prerequisite activity. They behave identically to standard activities once enrolled — same 3-task structure, same medal logic, same approval flow, same scoring — but they are invisible to members who have not yet unlocked them.
 
**Key constraints (decided):**
 
| Question | Decision |
|---|---|
| Who creates advanced activities? | Owner only |
| Can members unenroll? | No — enrollment is permanent |
| Scoring difference vs standard activities? | None — same medal logic |
| Visibility before unlock? | Hidden entirely from member's UI |
 
---
 
## Data Model Changes
 
### 1. New fields on `groups/{groupId}/activities/{activityId}`
 
```
isAdvanced: boolean                    // true = advanced; false (default) = standard
prerequisiteActivityId: string | null  // activityId that must be gold to unlock; null if isAdvanced = false
```
 
**No other changes to the activity document.** The existing `name`, `tasks`, `medalConditions`, `isLocked`, etc. all apply unchanged.
 
**`activityCount` behavior:** `activityCount` on the group document continues to count all activities (standard + advanced). If you ever want a "standard-only" denominator for the UI, derive it client-side from the activity list. Do not add a second counter.
 
---
 
### 2. New subcollection: `groups/{groupId}/enrollments/{userId}`
 
Tracks which advanced activities a member has unlocked and enrolled in.
 
```javascript
{
  userId: string,                      // must match the document path segment and request.auth.uid
  enrolledActivityIds: string[],       // list of advanced activityIds this member is enrolled in
  updatedAt: timestamp
}
```
 
**Why one doc per user (not per activity)?**
 
- Reads are cheap: fetching one doc for the current user gives the full enrollment picture.
- Writes are simple: `arrayUnion(activityId)` on the user's enrollment doc, not a shared array.
- Rules are straightforward: the doc is owned by the user, written only under controlled conditions.
 
**Why not store enrollment on `members/{userId}`?**
 
The `members/{userId}` document is already used for progress, display data, and rejection banners. Enrollment is logically separate (it is a capability gate, not a progress tracker) and keeping it in its own subcollection avoids bloating the member document with a growing array of ids as more advanced activities are added over time.
 
---
 
### 3. Unlock event: how enrollment is triggered
 
Enrollment is triggered **at the moment the owner approves the gold medal task** on the prerequisite activity — the same approval batch that writes the feed post and updates `progress`.
 
The approval batch is extended with one additional operation:
 
```javascript
// Existing approval batch operations (unchanged):
batch.set(feed post)
batch.update(members/{userId}, { progress: ... })
batch.delete(pending/{pendingId})
 
// NEW — only if approving the 3rd task (gold) of an activity
//       that is a prerequisite for one or more advanced activities:
batch.set(
  groups/{groupId}/enrollments/{userId},
  {
    userId,
    enrolledActivityIds: arrayUnion(advancedActivityId),
    updatedAt: serverTimestamp()
  },
  { merge: true }   // safe: creates doc if missing, extends array if it exists
)
```
 
**How to find which advanced activities to unlock:**
 
On the approval screen, the owner's client already has the full activity list loaded (for the approval queue context). When the approval results in a gold medal, the client filters activities where `isAdvanced === true && prerequisiteActivityId === approvedActivityId`. For each match, the enrollment write is added to the same batch.
 
> **Why not a Cloud Function?** At MVP scale (~10 users), adding the enrollment write to the existing client-side approval batch is consistent with the established pattern (§4.2, DESIGN.md). The known tradeoff (noted in §1) about moving approvals to Cloud Functions applies here too — this is a documented post-MVP migration path.
 
---
 
## Security Rules
 
All new rules follow the existing helper conventions: `isGroupMember(groupId)`, `isGroupOwner(groupId)`, `groupDoc`.
 
### Activities — visibility gate
 
Advanced activities must not be readable by members who have not enrolled. The rule below replaces (or augments) the existing `activities` read rule.
 
```javascript
match /activities/{activityId} {
 
  // Owner always sees all activities (including advanced/locked ones).
  allow read: if isGroupOwner(groupId);
 
  // Members can read an activity if:
  //   (a) it is not an advanced activity, OR
  //   (b) it is advanced and they are enrolled.
  allow read: if isGroupMember(groupId)
    && (
      resource.data.isAdvanced == false
      || get(/databases/$(database)/documents/groups/$(groupId)/enrollments/$(request.auth.uid))
           .data.enrolledActivityIds.hasAny([activityId])
    );
 
  // Owner-only writes (unchanged from today).
  allow write: if isGroupOwner(groupId);
}
```
 
> **Cost note:** The `get()` in the member read rule is one additional Firestore read per activity document read when the member is enrolled in at least one advanced activity. At family scale this is negligible. If you later query the full activity list in one call (e.g. `getDocs(collection(...))`), you pay one `get()` per document evaluated. Acceptable for ~10 activities and ~10 members; revisit if the activity list grows large.
 
### Enrollments subcollection
 
```javascript
match /enrollments/{userId} {
 
  // Only the member themselves can read their own enrollment doc.
  allow read: if request.auth != null && request.auth.uid == userId
                && isGroupMember(groupId);
 
  // Owner can read any enrollment doc (for approval queue context and admin visibility).
  allow read: if isGroupOwner(groupId);
 
  // Create and update: only the owner may write (enrollment is triggered by approval, not self-serve).
  // The merge: true pattern means both create and update must be permitted.
  allow create, update: if isGroupOwner(groupId);
 
  // No delete — enrollment is permanent.
  allow delete: if false;
}
```
 
---
 
## UI Changes
 
### Owner: creating an advanced activity
 
The existing "Add activity" form (owner only, Group Settings) gains two new fields, shown only when the owner toggles **Advanced activity**:
 
```
[ ] Advanced activity                         ← toggle / checkbox
 
  (when checked, reveal:)
  Prerequisite activity: [ dropdown of existing activities ]
  "Members who earn Gold on the selected activity will be enrolled automatically."
```
 
**Validation:**
- An advanced activity requires a `prerequisiteActivityId` — the dropdown must be selected.
- A standard activity (`isAdvanced: false`) has `prerequisiteActivityId: null`.
- The prerequisite activity must already exist (populated from the loaded activity list).
- An advanced activity can itself be the prerequisite for another advanced activity (chain unlocks). No special validation needed — the system handles this naturally.
 
**Owner activity list (Group Settings / Group Info):**
 
Advanced activities show an **Advanced** badge (e.g. a small purple pill) next to the activity name. This is visible only to the owner. Members see enrolled advanced activities without any badge — they look identical to standard activities once unlocked.
 
---
 
### Member: unlocking an advanced activity
 
**When gold medal is approved for the prerequisite activity**, the feed post is shown as normal. Additionally, the member sees a **one-time unlock banner** the next time they visit the Activities tab:
 
```
┌──────────────────────────────────────────┐
│ 🔓  You unlocked a new activity!         │
│     "Advanced Cycling Challenge"          │
│     You've been enrolled automatically.  │
│                          [ Got it ]      │
└──────────────────────────────────────────┘
```
 
**Implementation note on the banner:** The banner is shown when:
- The member's `enrolledActivityIds` contains an activityId they have not yet seen (i.e. `progress[activityId]` does not exist or is empty, and this is their first load since enrollment).
- A simple approach: store `seenAdvancedActivityIds: string[]` in `localStorage` client-side. When `enrolledActivityIds` contains an id not in `seenAdvancedActivityIds`, show the banner and add to local storage on dismiss. No extra Firestore write needed.
 
**Activity list (member view):**
 
- Advanced activities that the member is **not enrolled in**: not shown (hidden entirely).
- Advanced activities that the member **is enrolled in**: shown identically to standard activities. No badge, no special treatment — they are just activities to them.
 
---
 
### Profile screen: nested hierarchy
 
On the profile screen, advanced activities are displayed **indented under their prerequisite**, making the unlock relationship visible at a glance. This only applies to the profile — the activities tab and feed are unchanged.
 
```
Cooking          🥇 Gold
  └── Chef       🥈 Silver (in progress)
 
Cycling          🥈 Silver (in progress)
 
Running          🥉 Bronze
  └── Trail Running  (enrolled, not started)
```
 
**Rendering rules:**
 
- A standard activity with no enrolled advanced child renders as a flat row (unchanged from today).
- A standard activity that has one or more enrolled advanced children renders with those children indented beneath it, in order of enrollment.
- An advanced activity **never** appears as a top-level row on the profile — it is always nested under its prerequisite.
- If the member is enrolled in an advanced activity but has not yet started it, show it indented with no medal and no progress indicator (just the activity name).
- If the prerequisite activity itself was unlocked by another activity (chain unlock), the full chain is nested: grandparent → parent (indented) → child (double-indented). Keep visual indentation shallow — one level of `└──` per depth is sufficient; chains longer than 2 are unlikely in practice.
 
**Data requirements:**
 
The profile screen already loads the member's `progress` map and the group's activity list. To render the hierarchy, it additionally needs:
 
- The member's `enrollments/{userId}` doc (one extra read per profile load) to know which advanced activities they are enrolled in.
- The activity list's `isAdvanced` and `prerequisiteActivityId` fields to build the parent-child map client-side.
 
**Client-side grouping logic (pseudocode):**
 
```javascript
// Build a map: prerequisiteActivityId → [advancedActivity, ...]
const childMap = {};
for (const activity of activities) {
  if (activity.isAdvanced && enrolledActivityIds.includes(activity.id)) {
    const parent = activity.prerequisiteActivityId;
    if (!childMap[parent]) childMap[parent] = [];
    childMap[parent].push(activity);
  }
}
 
// Render: for each standard (non-advanced) activity, render it,
// then render its children indented beneath it.
const topLevel = activities.filter(a => !a.isAdvanced);
for (const activity of topLevel) {
  renderActivityRow(activity, { indent: 0 });
  for (const child of childMap[activity.id] ?? []) {
    renderActivityRow(child, { indent: 1 });
  }
}
```
 
No changes to Firestore reads beyond fetching the enrollment doc — all grouping is done client-side from data already loaded.
 
---
 
## Approval Flow — Changes
 
The only change to the existing approval flow is the **conditional enrollment batch write** described in the data model section above. The UI for the owner approval queue is unchanged.
 
**Logic in the approval client (pseudocode):**
 
```javascript
async function approveSubmission(groupId, pendingDoc, memberDoc, activities) {
  const { userId, activityId } = pendingDoc;
  const currentProgress = memberDoc.progress?.[activityId] ?? { tasksCompleted: 0 };
  const newTasksCompleted = currentProgress.tasksCompleted + 1;
  const isGold = newTasksCompleted === 3;
 
  const batch = writeBatch(db);
 
  // Existing operations (unchanged)
  batch.set(feedRef, feedPost);
  batch.update(memberRef, { [`progress.${activityId}.tasksCompleted`]: newTasksCompleted, ... });
  batch.delete(pendingRef);
 
  // NEW: if gold medal earned, enroll member in any unlocked advanced activities
  if (isGold) {
    const unlocked = activities.filter(
      a => a.isAdvanced && a.prerequisiteActivityId === activityId
    );
    for (const advActivity of unlocked) {
      const enrollmentRef = doc(db, `groups/${groupId}/enrollments/${userId}`);
      batch.set(
        enrollmentRef,
        {
          userId,
          enrolledActivityIds: arrayUnion(advActivity.id),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    }
  }
 
  await batch.commit();
}
```
 
---
 
## Edge Cases & Decisions
 
| Scenario | Behavior |
|---|---|
| Member earns gold before advanced activity exists | No enrollment (no matching advanced activity at approval time). When owner later creates the advanced activity, they may manually enroll existing gold holders — or accept that advanced activities only auto-enroll going forward. **Recommended:** document this and handle manually via a one-off enrollment write in Firebase Console if needed. |
| Member is removed from group | Enrollment doc is deleted as part of the member removal batch (same pattern as pending deletions in §7.9 of DESIGN.md). |
| Advanced activity is the prerequisite for another advanced activity | Supported naturally. When the gold on advanced activity A is approved, the system checks for other advanced activities with `prerequisiteActivityId === A.id` and enrolls accordingly. |
| Owner earns gold (implicitly participates in all activities) | Owner is treated the same as any member for enrollment purposes. The approval batch includes them if they are the member being approved. In practice the owner approves their own submissions — this is an existing edge case in the app, not new. |
| Multiple advanced activities unlock from the same prerequisite | All matching advanced activities are added to the same batch as separate `arrayUnion` writes on the same enrollment doc. Safe — `merge: true` handles concurrent writes to the same doc. |
 
---
 
## Implementation Checklist

Track deployment and QA here; code lives under `src/` and `firestore.rules`.

### Data model
- [x] Add `isAdvanced: boolean` and `prerequisiteActivityId: string | null` — `buildActivityDocument` / `groupService.js`, Group Settings add + edit, `addGroupActivity` validation
- [x] Backfill legacy activity docs — `ensureActivityAdvancedDefaults(groupId)` in `groupSettingsService.js` (auto-run when owner opens Group settings)
- [x] `enrollments/{userId}` — created on first gold unlock (`approvalService` transaction)

### Security rules
- [x] `activities` read gate — owner all; members standard **or** enrolled advanced; legacy without `isAdvanced` treated as standard (`activityIsStandard`)
- [x] `enrollments/{userId}` — **read:** any group member (see **Implementation status** below); **write:** owner; **delete:** owner (member removal)
- [ ] Emulator / CI: run `npm run test:rules` (needs Java) — coverage in `tests/firestore.feed-rules.test.js` → `describe('… advanced')`

### Owner UI
- [x] Add activity: **Advanced** checkbox + prerequisite `<select>` (standard activities only)
- [x] **Advanced** badge — Group settings activity list + Group Info (owner-only context)
- [x] Edit activity: advanced fields only while `isLocked === false` (`updateActivityDocument`)

### Approval flow
- [x] On gold medal — `runTransaction` in `approvePendingSubmission` writes `enrollments` with `arrayUnion` + `merge` (full `activities` list passed from `GroupApprovalsPage`)
- [ ] Manual QA: approve 3rd task on prerequisite → enrollment doc → member sees advanced activity + unlock banner

### Member UI
- [x] Activities / picker / group info — `subscribeMemberVisibleActivities` or `subscribeActivitiesForViewer` (owner sees all)
- [x] Unlock banner — Activities tab; localStorage key `adv-unlock-seen-{groupId}-{activityId}`
- [x] No **Advanced** badge on member-facing activity rows (badge is owner-only surfaces)
- [x] Profile — `subscribeActivitiesForProfile` + `buildProfileActivityRows` (nested under prerequisite; chains supported)

### Product / edge cases
- [x] Member removal — `removeGroupMember` deletes `enrollments/{removedUid}`
- [x] Retroactive gold / late-added advanced — documented in `docs/KNOWN_CONCERNS.md` (**Advanced activities**)
- [x] **Standings** — `subscribeStandardActivitiesOnly` (advanced medals excluded from ranking denominator; same bar for everyone)

---

## Implementation status (repo)

Use this section to reconcile the spec with reality without re-reading the codebase.

| Topic | Shipped behavior |
|---|---|
| **Enrollment reads** | Any **group member** may read `enrollments/{anyMemberUid}` so profile and shared UI work. *Spec sketch above said self + owner only — widened on purpose.* |
| **Enrollment delete** | **Owner** may delete (member removal). *Spec said `delete: false` — exception for cleanup.* |
| **Member activity queries** | Not one `onSnapshot` on all `activities` — **`subscribeMemberVisibleActivities`** (`isAdvanced == false` query + enrollment + per-advanced doc listeners). |
| **Approval write** | **`runTransaction`** + `arrayUnion`, not a standalone `writeBatch` pseudocode-only path. |
| **Indexes** | **None required** for member standard-activity queries: `where('isAdvanced', '==', false)` only, then **client sort** by `sortOrder` (`activityService.js`). Avoids composite-index deploy for ~10 activities. |
| **Manual deploy** | After deploy, owners should open **Group settings** once per group (or rely on backfill) so legacy activity docs get `isAdvanced: false`. |

---

## Checklist hygiene (for agents / maintainers)

When you change behavior that a onepager describes, **update that doc’s checklist** (and this **Implementation status** table if rules diverge). For other phase-two specs: `expandProfileImage-onepager.md` and `notifications-onepager.md` keep their own checklists — update those files when those features move.

---
 
## Rejected Alternatives
 
| Approach | Why rejected |
|---|---|
| Store enrolled ids on `members/{userId}` | Mixes progress/display data with capability gating; enrollment belongs in its own collection |
| `enrolledUserIds: []` array on the activity document | Shared array causes write contention; subcollection per user is cleaner and consistent with existing patterns |
| Cloud Function to trigger enrollment | Correct long-term but unnecessary complexity for MVP-adjacent feature at family scale |
| Show advanced activities as locked/teased (visible but blocked) | Adds UI complexity and spoils surprise; hidden is simpler and more fun |
| Allow unenrollment | Adds a delete path, edge cases around partially completed advanced activities, and UI for leaving — not worth it at this scale |
