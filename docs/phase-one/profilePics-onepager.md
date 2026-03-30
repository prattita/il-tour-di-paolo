# Profile Pictures — Feature Spec
 
> Status: Fast Follow (post-MVP)  
> Last updated: March 2026  
> Parent doc: DESIGN.md  
> **MVP:** Profile photo upload is **not** in scope; ship this when you pick up the fast-follow doc.
 
---
 
## Implementation notes (read before coding)
 
1. **Download URL token (most important nuance)**  
   Even when the Storage **object path** stays fixed (`avatars/{userId}`), calling `getDownloadURL()` after each upload returns a URL whose **query token changes**. Treat `avatarUrl` as **not stable across uploads**. After every successful upload you must **fetch the new download URL and write it to Firestore** (users + denormalized member docs). Do not assume the old string still works.
 
2. **Feed posts do not update retroactively**  
   Same intentional choice as **`displayName`** on feed posts: historical posts keep the avatar URL (and name) frozen at approval time. Only **new** UI that reads live `members/{userId}.avatarUrl` updates when the user changes their photo.
 
3. **Batch write over `groupIds`**  
   After upload, update `users/{userId}` and **each** `groups/{groupId}/members/{userId}` in one Firestore batch (iterate `users/{userId}.groupIds`). At family scale this is fine; if you ever hit batch limits (500 ops), chunk into multiple batches.
 
---
 
## Overview
 
Allow users to upload a custom profile picture. The image is displayed as their avatar throughout the app — in the feed, group member list, approval queue, and profile screen. Falls back to initials if no photo is set.
 
---
 
## Storage Strategy
 
Firebase Storage path:
 
```
avatars/{userId}
```
 
The file path uses the user's ID as the filename with no extension or random suffix. This means uploading a new photo **automatically overwrites the previous one** — no deletion step needed, no orphaned files, no storage bloat. One user = one storage slot, always.
 
```
avatars/abc123    ← Paolo's current avatar, always at this path
```
 
On every new upload, the old image is silently replaced at the same path. Firebase Storage handles this natively.
 
---
 
## Data Model
 
No new Firestore collection needed. The avatar URL is stored on the existing `users/{userId}` document:
 
```
users/{userId}
{
  ...
  avatarUrl: string | null    // null = no photo set, show initials fallback
}
```
 
After every successful upload to `avatars/{userId}`, update `avatarUrl` on the user document with the **new** download URL from `getDownloadURL()` (see **Implementation notes** above — token changes every time).
 
---
 
## Denormalization
 
`avatarUrl` is denormalized in two places beyond `users/{userId}`:
 
| Location | Field | When to update |
|---|---|---|
| `users/{userId}` | `avatarUrl` | On every upload |
| `groups/{groupId}/members/{userId}` | `avatarUrl` | On every upload, for each group the user belongs to |
 
Both updates should happen in a **Firestore batch write** immediately after the Storage upload succeeds. Iterate over `users/{userId}.groupIds` to update each member document.
 
```javascript
// After successful Storage upload
const newAvatarUrl = await getDownloadURL(ref(storage, `avatars/${userId}`))
 
const batch = writeBatch(db)
batch.update(doc(db, `users/${userId}`), { avatarUrl: newAvatarUrl })
 
for (const groupId of user.groupIds) {
  batch.update(
    doc(db, `groups/${groupId}/members/${userId}`),
    { avatarUrl: newAvatarUrl }
  )
}
 
await batch.commit()
```
 
Feed posts are **not** updated retroactively — they capture the avatar URL at the time of approval. Intentional: same consistency story as **`displayName`** on historical posts.
 
---
 
## UX Flow
 
1. User taps their avatar / initials on the Profile screen
2. File picker opens — camera or library
3. Image uploads to `avatars/{userId}` in Firebase Storage
4. On success: batch write updates `avatarUrl` in Firestore
5. Avatar updates instantly across the app via Firestore listeners
6. Loading state shown during upload; error state if upload fails with retry option
 
**No crop or resize UI for v1 of this feature** — accept the raw image. Later: client-side resize before upload (e.g. max 500kb, resize to 400x400).
 
---
 
## Firebase Storage Rules
 
Add to existing Storage rules:
 
```javascript
match /avatars/{userId} {
  // User can read and write their own avatar only
  allow read: if request.auth != null;
  allow write: if request.auth.uid == userId;
}
```
 
---
 
## Fallback
 
When `avatarUrl` is `null` or the image fails to load, show an initials avatar generated from `displayName`:
 
```javascript
const getInitials = (name) =>
  name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
 
// e.g. "Paolo Ratti" → "PR"
```
 
---
 
## Known Limitations
 
- **No image moderation for v1.** Any image can be uploaded. Acceptable for a closed family app.
- **File size not enforced client-side for v1.** Later: validation (e.g. max 5MB) and optional resize before upload.
 
(See **Implementation notes** for download-token behavior and non-retroactive feed posts.)
 
---
 
## Implementation Checklist
 
- [ ] Add avatar upload tap target on Profile screen
- [ ] Wire up Firebase Storage upload to `avatars/{userId}`
- [ ] Batch write `avatarUrl` to `users/{userId}` and all `groups/{groupId}/members/{userId}`
- [ ] Add initials fallback component used consistently across all screens
- [ ] Update Firebase Storage rules to include `avatars/{userId}`
- [ ] Test avatar update propagates to feed, member list, approval queue
 
