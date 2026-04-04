# Notifications — Feature Spec

> Status: **Push + badging shipped** in repo. **Email delivery deferred** until you own a domain for Resend (Vercel `*.vercel.app` is not enough). **§4** = your device QA.  
> Last updated: April 2026  
> Related: [Account settings](settingsPage-onepager.md), [Internationalisation (i18n)](i18n-onepager.md), [DESIGN.md](../mvp/DESIGN.md)

---

## Goal

Deliver **opt-in email and push** for key competition events (pending submissions, approvals/rejections, new members, feed activity) using **Resend** + **Firebase Cloud Functions** (email) and **FCM** (web push). Preferences and toggles live on **global account settings** (`/settings`), consistent with [Account settings](settingsPage-onepager.md).

---

## Overview

Two channels — **email** and **push** — covering the events in the table below. Each channel has a **single global toggle** per user (no per-event granularity for v1). Email uses Resend + Cloud Functions. Push uses FCM (iOS PWA via Safari Home Screen, Android via supported browsers).

---

## Scope (v1)

- **`notifications` block** on `users/{userId}` (`emailEnabled`, `pushEnabled`, `pushToken`).
- **Rejection path:** `rejected: true` on pending doc before delete so a function can run on `onUpdate` (Firestore has no delete trigger).
- **UI:** Email and push toggles on **`/settings`** (Notifications section); email address read-only from Firebase Auth.
- **Email:** Plain text, four transactional flows + rejection handling as specified below.
- **Push:** Payloads and deep links per event; **new feed post** is push-only (no email).

---

## Out of scope (v1)

- Per-event notification settings (see **Rejected alternatives**).
- In-app notification center / inbox.
- HTML or branded email templates (plain text only for v1).
- Third-party push vendors (OneSignal, etc.).
- **i18n** of notification **payload** copy (emails/push titles can stay English v1; UI toggles use app `t()` when implemented).

---

## Notification events

| Event | Email | Push | Recipients |
|---|---|---|---|
| New pending submission | ✅ | ✅ | Owner only |
| Submission approved | ✅ | ✅ | Submitting user |
| Submission rejected | ✅ | ✅ | Submitting user |
| New member joined | ✅ | ✅ | Owner only |
| New feed post | ❌ | ✅ | All members |

Email is not sent for new feed posts — too frequent. Push is lightweight enough for feed activity.

---

## Notification settings

A single **global toggle per channel** — all notification types for that channel on or off. No per-event granularity for v1.

Stored on the user document:

```javascript
// users/{userId}
{
  // ...existing fields
  notifications: {
    emailEnabled: boolean,    // default: false
    pushEnabled: boolean,     // default: false
    pushToken: string | null  // FCM token, set on push opt-in / refresh
  }
}
```

**Settings UI** lives in the **Notifications** section on **[Account settings](settingsPage-onepager.md)** (`/settings` — protected, outside group shell). Push and email toggles are implemented in `PushNotificationsSection.jsx`.

```
┌─────────────────────────────┐
│  Notifications              │
│                             │
│  Email notifications  [ ◯ ] │  ← toggle
│  your@email.com             │  ← below toggle, read-only (Auth)
│                             │
│  Push notifications   [ ◯ ] │  ← toggle
│  (requires browser prompt)  │  ← hint before first enable
└─────────────────────────────┘
```

- Email address shown below the email toggle — read-only, from Firebase Auth.
- Push toggle triggers the browser permission prompt on first enable.
- If push permission is denied by the OS/browser, show the toggle disabled with a short note (e.g. enable notifications in device or site settings).
- Both toggles default **off** — fully opt-in.
- **i18n:** Section title, labels, and helper copy should use the same `t('…')` patterns as the rest of `/settings` ([i18n-onepager](i18n-onepager.md)).

---

## Email notifications

### Stack

- **Resend** — transactional email; free tier (e.g. 3,000 emails/month) sufficient at family scale.
- **Firebase Cloud Functions** — Firestore triggers calling Resend’s API.
- One callable/trigger path per notification family below (implementation may consolidate shared helpers).

### Cloud Functions

**`onNewPendingSubmission`**
```
Trigger: onCreate on groups/{groupId}/pending/{pendingId}
Recipient: group owner (ownerId on groups/{groupId})
Subject: "New submission to review — {activityName}"
Body: {memberName} submitted "{taskName}" in {activityName}. Open the app to review.
Condition: owner.notifications.emailEnabled == true
```

**`onSubmissionApproved`**
```
Trigger: onCreate on groups/{groupId}/feed/{postId}
Filter in function: type == "task_completion" (ignore system posts)
Recipient: post.userId
Subject: "Your submission was approved — {taskName} 🎉"
Body: Your submission for "{taskName}" in {activityName} has been approved.
      You earned a {medal} medal!
Condition: user.notifications.emailEnabled == true
```

**`onSubmissionRejected`**
```
Trigger: onUpdate on pending when rejected:true set before deletion
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
Body: {memberName} has joined Il Tour di Paolo.
Condition: owner.notifications.emailEnabled == true
Skip: do not notify when the new member is the owner (owner’s own member doc on group create)
```

### Rejection trigger note

Firestore cannot trigger on document **delete**. For rejection email/push, the client sets **`rejected: true`** (and any minimal fields the function needs) on the pending document, the function runs on **`onUpdate`**, then the client completes the usual delete + Storage cleanup. One extra write; avoids a separate `rejectedSubmissions` collection.

### Email templates

Plain text only for v1 — no HTML templates. Upgrade to branded HTML post-v1 if desired.

---

## Push notifications

### Stack

- **Firebase Cloud Messaging (FCM)** — web push for supported browsers / iOS PWA.
- **Same Cloud Functions** as email — add push dispatch alongside email where both apply.
- **Service worker** (`firebase-messaging-sw.js`) — background push on web.
- **VAPID keys** — from Firebase Console, used for Web Push subscription.

### iOS PWA support

Push works for PWAs added to the Home Screen in Safari (iOS 16.4+). Users need notification permission. Lock screen and Notification Center follow platform behavior once granted. **Custom app-icon badge** (owner pending count) is implemented — see **App icon badging (shipped)**.

**Known limitation:** FCM tokens on iOS PWAs can expire or reset. The app should **refresh the token on launch** (when push is enabled) and update `users.notifications.pushToken` if it changed.

### Android support

Full push via Chrome, Firefox, Edge, Samsung Internet. Home screen install not required. Same FCM code path as iOS where applicable.

### Push token management

On push opt-in:

```javascript
const permission = await Notification.requestPermission()
if (permission === 'granted') {
  const token = await getToken(messaging, { vapidKey: VAPID_KEY })
  await updateDoc(doc(db, `users/${userId}`), {
    'notifications.pushEnabled': true,
    'notifications.pushToken': token
  })
}
```

On app launch (silent refresh when push enabled):

```javascript
onMessage(messaging, (payload) => {
  // Foreground: prefer in-app toast/banner, not a second system notification
})

const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY })
if (currentToken && currentToken !== storedToken) {
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
Click: /group/{groupId}/approvals
```

**Submission approved:**
```
Title: "Submission approved 🎉"
Body:  "Your {taskName} earned a {medal} medal!"
Click: /group/{groupId}/feed
```

**Submission rejected:**
```
Title: "Submission needs a resubmit"
Body:  "Your {taskName} submission was not approved. Tap to resubmit."
Click: /group/{groupId}/activities
```

**New member joined (owner):**
```
Title: "New member joined"
Body:  "{memberName} joined your group"
Click: /group/{groupId}/settings
```

**New feed post (all members):**
```
Title: "{memberName} completed a task"
Body:  "{taskName} in {activityName} — {medal} medal"
Click: /group/{groupId}/feed
```

### Foreground vs background push

- **Background:** FCM delivers a `notification` payload; the browser/OS shows one system notification. The service worker **does not** call `showNotification` again (that caused duplicate alerts).
- **Foreground:** `onMessage` — in-app dismissible banner (`FcmForegroundBanner`); no second system notification.

---

## Data model changes

### `users/{userId}` — add `notifications`

```javascript
notifications: {
  emailEnabled: boolean,     // default: false
  pushEnabled: boolean,      // default: false
  pushToken: string | null   // FCM registration token
}
```

### `groups/{groupId}/pending/{pendingId}` — rejection flag (transient)

```javascript
rejected: boolean   // set true immediately before delete path; triggers onUpdate handlers
```

---

## Firestore security rules

Notification fields live on **`users/{userId}`**, which already allows **`read, write`** for `request.auth.uid == userId` (see [DESIGN.md](../mvp/DESIGN.md) §10). The signed-in user may update `notifications.*` and `pushToken` without a separate rule. **No rules change is required** for v1 unless you later tighten `users` updates to a field allowlist.

---

## Edge cases & decisions

| Scenario | Behavior |
|---|---|
| Owner creates group | `onNewMemberJoined` must **not** email/push the owner for their own `members/{ownerId}` create. |
| `onCreate` feed post | Functions must **filter** `type === 'task_completion'` so system posts do not trigger “submission approved” to wrong recipients. |
| User disables email/push | Functions still run but **no-op** send when the corresponding flag is false. |
| Member removed | Existing DESIGN cleanup applies; no notification spec change. |

---

## Implementation checklist

> **Tracking:** Mark `[x]` when shipped. After substantive changes, update this section and the **Status** line in the header.

Work proceeds in **logical chunks** below. **Push and email do not depend on each other** (same triggers can call FCM and/or Resend once both exist). Order the PRs however fits your schedule.

### 1. Web app & `/settings` (FCM client)

- [x] Client reads **`VITE_FIREBASE_VAPID_KEY`** when present (`fcmConfig.js`, token flow). **Ops (you):** set that env var in **each** deploy environment + confirm Cloud Messaging enabled in Firebase Console.
- [x] `firebase-messaging-sw.js` generated at dev + build (`vite/plugins/firebaseMessagingSw.js`); served at `/firebase-messaging-sw.js`
- [x] **`/settings`:** push toggle; persist `notifications.pushEnabled` and `notifications.pushToken`; permission on first enable; **denied** / unsupported / missing-VAPID copy
- [x] Token refresh when signed in and `pushEnabled` (`FcmForegroundBanner`)
- [x] `notifications` on `users/{uid}` — on **new** users in `ensureUserProfile`; **legacy** docs via `ensureNotificationDefaults` after sign-in
- [x] Foreground `onMessage` → dismissible banner; background: FCM surfaces `notification` payload (SW does **not** call `showNotification` again — avoids duplicate alerts)
- [x] **`/settings` email:** toggle `notifications.emailEnabled`; read-only Auth email + hint copy

### 2. Cloud Functions — push (FCM)

- [x] **`onFeedTaskCompletionPush`** — `onCreate` `groups/{groupId}/feed/{postId}`, filter `type === 'task_completion'`; FCM to members (**skips actor**); **same handler** sends **“Submission approved”** push to **submitter only** (actor). `us-central1`; `WEB_APP_ORIGIN` in `functions/.env`.
- [x] **`onNewPendingSubmissionPush`** — `onCreate` pending → owner (push + token).
- [x] **`pushPendingRejectedToSubmitter`** — `onUpdate` when `rejected: true` (export name avoids legacy HTTPS name collision); client `updateDoc` then batch delete; Firestore rules allow owner-only `rejected` update.
- [x] **`onNewMemberJoinedPush`** — `onCreate` `members/{userId}` → owner; **skips** `memberId === ownerId`.

### 3. Cloud Functions — email (Resend)

- [x] Resend SDK in `functions/`; secret **`RESEND_API_KEY`** (`firebase functions:secrets:set`); optional param **`RESEND_FROM`** in `functions/.env` (verified domain in prod). See `functions/.env.example`.
- [x] **`/settings`:** `notifications.emailEnabled` toggle (`PushNotificationsSection`).
- [x] Same triggers as push: **`onNewPendingSubmissionPush`**, **`onFeedTaskCompletionPush`** (submitter approved only), **`pushPendingRejectedToSubmitter`**, **`onNewMemberJoinedPush`** — each calls **`maybeEmailUser`** when `emailEnabled` + Firebase Auth email; plain text per §“Email notifications”.
- [x] Recipient address from **`admin.auth().getUser(uid).email`** (not Firestore `users.email`).

### 4. QA & polish

- [ ] End-to-end on target browsers (Safari PWA, Chrome Android, others you care about): permission, token refresh, tap-through to routes
- [ ] Note browser-specific caveats in this file or `KNOWN_CONCERNS.md` if any
- [x] **App icon badging** — owner pending count on Home Screen PWA when app is **backgrounded**; **clears** when app is **foreground** (see **App icon badging** below)

---

## Implementation status (repo)

Use this table to reconcile the spec with the codebase without spelunking.

| Topic | Planned / shipped behavior |
|---|---|
| **Settings location** | **`/settings`** Notifications section ([settingsPage-onepager](settingsPage-onepager.md)); not group profile. |
| **FCM client** | `src/lib/firebaseMessaging.js`, `fcmConfig.js`, `pushSettingsService.js`, `FcmForegroundBanner.jsx`, `PushNotificationsSection.jsx`; Vite SW plugin. |
| **Cloud Functions** | Same four triggers: **FCM** always; **Resend** only when `RESEND_API_KEY` secret + valid `RESEND_FROM` exist (**email deferred** if not). Params: `WEB_APP_ORIGIN`, `RESEND_FROM`. Helpers: `functions/emailNotify.js`. |
| **Rejection flag** | Shipped: `updateDoc({ rejected: true })` before batch delete + Storage cleanup (`approvalService`). |
| **Badging** | **`OwnerPendingAppBadge`** + `useOwnerPendingAppBadge`, `ownerPendingBadgeService`, `lib/appBadge.js`. |

---

## Progress snapshot (where we are)

| Area | In repo | Your ops / verification |
|------|---------|---------------------------|
| **§1** FCM client, `/settings` toggles, SW at `/firebase-messaging-sw.js` | Done | Set **`VITE_FIREBASE_VAPID_KEY`** everywhere the app is hosted; confirm Cloud Messaging enabled in Firebase. |
| **§2** Push from four Firestore triggers | Done | **`WEB_APP_ORIGIN`** in `functions/.env`; Blaze; `firebase deploy --only functions`. |
| **§3** Resend email (code paths) | In repo | **Deferred in production:** needs **your domain** + DNS in Resend (`*.vercel.app` cannot be verified). Until then, `emailEnabled` is harmless; sends no-op if API key missing/invalid. |
| **§4** QA | Optional | Manual passes on Safari PWA + Android Chrome; note quirks if any. |
| **Badging** | Done (owners) | Home Screen PWA; test on installed iOS Safari app. |

---

## What you still need to do (checklist)

Use this when you come back to the project after a break.

1. **Hosting env:** `VITE_FIREBASE_VAPID_KEY` = Firebase Console → Project settings → Cloud Messaging → **Web Push certificates** (public key). Same value in local `.env` and production host (e.g. Vercel env vars).
2. **Functions env:** `functions/.env` with **`WEB_APP_ORIGIN`** (no trailing slash), e.g. `https://your-app.vercel.app`.
3. **Email (when ready):** Buy a domain → point it at Vercel for the app → add the same domain in **Resend** with DNS records → `RESEND_FROM` in `functions/.env` → enable **Secret Manager API** → `firebase functions:secrets:set RESEND_API_KEY` → deploy. **Until then, email is intentionally postponed** (push still works).
4. **Deploy:** `firebase deploy --only functions` (and **Firestore rules** if you ever changed pending `rejected` rules locally without deploying).
5. **§4:** Walk through the five **push** flows on device (pending → owner; approve → members + submitter; reject → submitter; join → owner; feed post → others). **Badge:** as owner, background the **installed** PWA with pending submissions → icon should show count; open app → badge clears.

---

## Email (deferred — no custom domain yet)

You’re on **Vercel’s default hostname** (`*.vercel.app`). That hostname is **not yours to verify in Resend**, so you **cannot** get a production `From:` address for transactional email without **buying a domain** (same domain can point to Vercel **and** be verified in Resend via DNS).

**What still works**

- **Push** (FCM): fully usable with `WEB_APP_ORIGIN` set to your Vercel URL.
- **Code:** Cloud Functions still call `maybeEmailUser` when `emailEnabled` is true; if **`RESEND_API_KEY`** is missing or too short, email is skipped **silently** (no user-facing error).
- **`/settings`:** Email toggle remains; turning it on **does not deliver mail** until Resend + domain are configured.

**Original spec gap while deferred**

- The notification table promised **email** for four events — **not delivered** to real inboxes until step 3 in **What you still need to do** is done. Everything else in the spec (push payloads, rejection flag, toggles) remains as implemented.

---

## App icon badging (shipped)

### Behavior (v1)

- **Who:** **Group owners** only. The badge number is the **total count of `pending` docs** across all groups where `groups/{groupId}.ownerId === uid` (same work as the approval queue).
- **When shown:** When the document becomes **`visibilityState === 'hidden'`** (user switched away / home button), the app queries Firestore and calls **`navigator.setAppBadge(n)`** (`n > 0`).
- **When cleared:** When the app is **`visible`** again, **`navigator.clearAppBadge()`** runs — so the bubble is a **“something waiting while you’re away”** hint, not a live counter on the icon while you’re inside the app.
- **Non-owners:** Count is always **0** → no badge when backgrounded.

### Code

- `src/components/OwnerPendingAppBadge.jsx` (mounted in `App.jsx` inside `AuthProvider`)
- `src/hooks/useOwnerPendingAppBadge.js`
- `src/services/ownerPendingBadgeService.js` (`getCountFromServer` per owned group)
- `src/lib/appBadge.js`

### Platform notes

- **iOS (Safari, 16.4+):** [Badging API](https://webkit.org/blog/14112/badging-for-home-screen-web-apps) — **Add to Home Screen** PWA; **notification permission** recommended for the badge to appear.
- **Android / desktop:** Supported only where the browser implements the [Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API).
- **Safari tab (not installed):** badge API unavailable.

### Possible follow-ups (not done)

- Recompute badge when a **push** arrives in the service worker (faster update without opening the app).
- A different **count** for **members** (would need a new product rule + data).

---

## Checklist hygiene (for agents / maintainers)

When notification behavior or routes change, update **this file’s checklist** and **Implementation status**. Cross-link: [Account settings](settingsPage-onepager.md) should stay in sync with **§1** (client) and **§3** (email toggle + Resend).

---

## Rejected alternatives

| Approach | Why rejected |
|---|---|
| Per-event notification settings | Too much settings surface for a family app; global toggles are enough for v1. |
| Email for new feed posts | Too noisy; push only. |
| In-app notification center | Scope creep; email + push cover the needs. |
| Third-party push (OneSignal, etc.) | FCM is already in the Firebase stack. |
| HTML email templates for v1 | Faster ship and less maintenance; upgrade later if needed. |

---

## Future

- **Email go-live** — custom domain + Resend verification (see **Email (deferred)**).
- Branded HTML email templates and localized notification copy.
- Per-event or per-group preferences if the product outgrows global toggles.
- Tighter **Storage** / **users** field-level rules if the app moves beyond a closed trust boundary ([DESIGN.md](../mvp/DESIGN.md) §10).
- Deep links from push into the correct group/route if the app adds richer routing state.
