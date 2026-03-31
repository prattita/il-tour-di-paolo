# Notifications — Feature Spec
 
> Status: Post-MVP (Phase 2)
> Last updated: March 2026
> Parent doc: DESIGN.md
 
---
 
## Overview
 
Two notification channels — email and push — covering key competition events. Both are opt-in via a single global toggle per user. Email uses Resend + Firebase Cloud Functions. Push uses Firebase Cloud Messaging (FCM) supporting iOS PWA (Safari bookmark) and Android.
 
---
 
## Notification Events
 
| Event | Email | Push | Recipients |
|---|---|---|---|
| New pending submission | ✅ | ✅ | Owner only |
| Submission approved | ✅ | ✅ | Submitting user |
| Submission rejected | ✅ | ✅ | Submitting user |
| New member joined | ✅ | ✅ | Owner only |
| New feed post | ❌ | ✅ | All members |
 
Email is not sent for new feed posts — too frequent, would feel spammy. Push is lightweight enough for feed activity.
 
---
 
## Notification Settings
 
A single **global toggle** per user — all notifications on or off. No per-event granularity for MVP.
 
Stored on the user document:
 
```javascript
// users/{userId}
{
  ...
  notifications: {
    emailEnabled: boolean,    // default: false
    pushEnabled: boolean,     // default: false
    pushToken: string | null  // FCM token, set on push opt-in
  }
}
```
 
Settings UI lives at the bottom of the Profile screen:
 
```
┌─────────────────────────────┐
│  Notifications              │
│                             │
│  Email notifications  [ ◯ ] │  ← toggle
│  your@email.com             │  ← shown below toggle, read-only
│                             │
│  Push notifications   [ ◯ ] │  ← toggle
│  (requires browser prompt)  │  ← shown before first enable
└─────────────────────────────┘
```
 
- Email address shown below the email toggle — read-only, pulled from Firebase Auth
- Push toggle triggers browser permission prompt on first enable
- If push permission is denied by the OS, toggle shown as disabled with a note: "Enable notifications in your device settings"
- Both toggles default to off — fully opt-in
 
---
 
## Email Notifications
 
### Stack
 
- **Resend** — transactional email provider, permanent free tier (3,000 emails/month)
- **Firebase Cloud Functions** — triggers on Firestore writes, calls Resend API
- One Cloud Function per notification event
 
### Cloud Functions
 
**`onNewPendingSubmission`**
```
Trigger: onCreate on groups/{groupId}/pending/{submissionId}
Recipient: group owner (look up ownerId from groups/{groupId})
Subject: "New submission to review — {activityName}"
Body: {memberName} submitted "{taskName}" in {activityName}. Open the app to review.
Condition: owner.notifications.emailEnabled == true
```
 
**`onSubmissionApproved`**
```
Trigger: onCreate on groups/{groupId}/feed/{postId} where type == "task_completion"
Recipient: post.userId
Subject: "Your submission was approved — {taskName} 🎉"
Body: Your submission for "{taskName}" in {activityName} has been approved.
      You earned a {medal} medal!
Condition: user.notifications.emailEnabled == true
```
 
**`onSubmissionRejected`**
```
Trigger: custom — write a rejected:{true} flag on pending doc before deletion,
         trigger fires on update, then deletes the doc
Recipient: pending.userId
Subject: "Your submission needs a resubmit — {taskName}"
Body: Your submission for "{taskName}" in {activityName} was not approved.
      Please resubmit with a new photo.
Condition: user.notifications.emailEnabled == true
```
 
**`onNewMemberJoined`**
```
Trigger: onCreate on groups/{groupId}/members/{userId}
Recipient: group owner
Subject: "{memberName} joined your group"
Body: {memberName} has joined Il Tour di Paolo 2026.
Condition: owner.notifications.emailEnabled == true
```
 
### Rejection trigger note
 
Firestore Cloud Functions cannot trigger on document deletion. To trigger the rejection email, the approval flow adds a `rejected: true` flag to the pending document before deleting it. The Cloud Function fires on the update, sends the email, then the client proceeds with deletion. This adds one extra write but avoids a separate `rejectedSubmissions` collection.
 
### Email templates
 
Plain text emails for MVP — no HTML templates. Clean, readable, no maintenance overhead. Upgrade to branded HTML templates post-MVP if desired.
 
---
 
## Push Notifications
 
### Stack
 
- **Firebase Cloud Messaging (FCM)** — handles push delivery for both iOS and Android
- Same Cloud Functions as email — add push dispatch alongside email dispatch
- **Service worker** (`firebase-messaging-sw.js`) — required for background push on web
- **VAPID keys** — generated in Firebase Console, used for Web Push subscription
 
### iOS PWA Support
 
Push notifications are supported for PWAs added to the Home Screen via Safari (iOS 16.4+). Users who have already bookmarked the app are ready for this feature — they just need to grant notification permission.
 
Lock screen notifications, Notification Center, and badge counts are all supported once permission is granted.
 
**Known limitation:** FCM push subscriptions on iOS PWAs can occasionally expire or disappear. The app should silently refresh the push token on each launch and update `pushToken` in Firestore if it changes.
 
### Android Support
 
Full push support via Chrome, Firefox, Edge, and Samsung Internet. Does not require home screen installation. Same FCM codebase as iOS.
 
### Push token management
 
On push opt-in:
```javascript
// Request permission + get FCM token
const permission = await Notification.requestPermission()
if (permission === 'granted') {
  const token = await getToken(messaging, { vapidKey: VAPID_KEY })
  await updateDoc(doc(db, `users/${userId}`), {
    'notifications.pushEnabled': true,
    'notifications.pushToken': token
  })
}
```
 
On app launch (silently refresh token):
```javascript
onMessage(messaging, (payload) => {
  // foreground message handler
})
 
// Refresh token if changed
const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY })
if (currentToken !== storedToken) {
  await updateDoc(doc(db, `users/${userId}`), {
    'notifications.pushToken': currentToken
  })
}
```
 
### Push payloads per event
 
**New pending submission (owner):**
```
Title: "New submission to review"
Body:  "{memberName} submitted {taskName} in {activityName}"
Click: opens /group/{groupId}/approvals
```
 
**Submission approved:**
```
Title: "Submission approved 🎉"
Body:  "Your {taskName} earned a {medal} medal!"
Click: opens /group/{groupId}/feed
```
 
**Submission rejected:**
```
Title: "Submission needs a resubmit"
Body:  "Your {taskName} submission was not approved. Tap to resubmit."
Click: opens /group/{groupId}/activities
```
 
**New member joined (owner):**
```
Title: "New member joined"
Body:  "{memberName} joined your group"
Click: opens /group/{groupId}/settings
```
 
**New feed post (all members):**
```
Title: "{memberName} completed a task"
Body:  "{taskName} in {activityName} — {medal} medal"
Click: opens /group/{groupId}/feed
```
 
### Foreground vs background push
 
- **Background** (app not open): handled by service worker, system displays notification natively
- **Foreground** (app open): `onMessage` handler fires — show an in-app toast/banner instead of a system notification to avoid duplicate alerts
 
---
 
## Data Model Changes
 
### `users/{userId}` — add notifications block
```javascript
notifications: {
  emailEnabled: boolean,     // default: false
  pushEnabled: boolean,      // default: false
  pushToken: string | null   // FCM registration token
}
```
 
### `groups/{groupId}/pending/{submissionId}` — add rejection flag
```javascript
rejected: boolean   // set to true before deletion to trigger rejection email/push
```
 
---
 
## Firestore Security Rules Updates
 
```javascript
match /users/{userId} {
  // Existing rule — user reads/writes own doc
  allow read, write: if request.auth.uid == userId;
 
  // Narrow: any authenticated user can update pushToken only
  // (needed for silent token refresh on launch)
  // Covered by existing write rule — no change needed
}
```
 
No additional rules needed — notification fields live on `users/{userId}` which the user already owns.
 
---
 
## Implementation Checklist
 
### Infrastructure
- [ ] Create Resend account, generate API key, add to Firebase Functions environment config
- [ ] Generate VAPID keys in Firebase Console
- [ ] Create `firebase-messaging-sw.js` service worker
- [ ] Add FCM to Firebase project and app config
 
### Email
- [ ] `onNewPendingSubmission` Cloud Function
- [ ] `onSubmissionApproved` Cloud Function
- [ ] `onSubmissionRejected` Cloud Function (with rejected flag pattern)
- [ ] `onNewMemberJoined` Cloud Function
- [ ] Plain text email templates for all four events
 
### Push
- [ ] Push permission request + FCM token capture on opt-in
- [ ] Silent token refresh on app launch
- [ ] Add push dispatch to all four existing Cloud Functions
- [ ] `onNewFeedPost` Cloud Function — push only, no email
- [ ] Foreground message handler — show in-app toast instead of system notification
- [ ] Service worker background message handler
 
### Settings UI
- [ ] Email notifications toggle on Profile screen
- [ ] Push notifications toggle on Profile screen
- [ ] Handle denied OS permission state gracefully
- [ ] Silent token refresh wired to app launch
 
---
 
## Rejected Alternatives
 
| Approach | Why rejected |
|---|---|
| Per-event notification settings | Adds settings complexity for a family app — global toggle sufficient |
| Email for new feed posts | Too frequent — push is the right channel for real-time activity |
| In-app notification center | Scope creep — system push + email covers the use cases cleanly |
| Third-party push service (OneSignal etc.) | FCM is already in the stack, no additional vendor needed |
| HTML email templates for MVP | Maintenance overhead — plain text is readable and faster to ship |
 