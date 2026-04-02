# Account settings (global) — Mini spec

> Status: **Phase Two — shipped** (route, nav, profile photo + stubs)  
> Last updated: April 2026  
> Related: [Notifications](notifications-onepager.md), [Expand profile image](expandProfileImage-onepager.md), [DESIGN.md](../mvp/DESIGN.md)

---

## Goal

Add a **global account settings** screen that is **not tied to a single group**. Users can open it from **home** and from **any group** without going through group-only navigation. This page holds **cross-group** preferences and account affordances; it does **not** replace **group profile** (progress, medals, per-group context) or **group settings** (owner-only group configuration).

---

## Problem with today’s layout

- **Group profile** (`GroupProfilePage`) is the natural place for “me in this group,” but it is **only reachable inside a group**. There is no top-level place for **app-wide** settings.
- **Group settings** is owner-only and group-scoped — wrong mental model for notifications, language, and global profile photo.

---

## Scope (v1)

- **New route:** e.g. `/settings` (protected, signed-in only). Renders a simple page with sections; exact visual polish can match existing cards (`bg-tour-surface`, borders).
- **Sections (stubs acceptable in first PR):**
  - **Profile photo** — same behavior as self-profile: reuse **`uploadUserAvatarAndSyncGroups`** (and same `Avatar` + file input pattern as `GroupProfilePage` for self). **Two entry points, same action** (see below).
  - **Notifications** — placeholders or toggles per [notifications-onepager.md](notifications-onepager.md) when that work lands.
  - **Language** — **i18n wired** (`en` / `es` / `it` pills); see [i18n-onepager.md](i18n-onepager.md).
- **Sign out:** optional duplicate on this page vs home only — product choice; at minimum, **home** and **group drawer** keep existing sign-out.

---

## Out of scope (v1)

- Replacing or removing **group profile** or **group settings**.
- Group-specific toggles on this page (those stay in group settings or per-group UI).
- Email/password change flows unless already planned elsewhere.

---

## Navigation — entry points

### 1) Home (`HomePage`)

**Recommendation:** In the **top header card** (same row as “Sign out”), add a **Settings** control:

- **Placement:** To the **left of** “Sign out” — e.g. text link or secondary button **“Settings”** → `/settings`. Keeps account actions grouped; does not clutter the groups list.

### 2) Group shell (`GroupLayout` — drawer / desktop column)

**Requirement:** Add **Settings** at the **bottom of the column**, **below** “Home (all groups)” and **above** “Sign out” (same footer block as today). Styled like the existing footer links for consistency.

### 3) Profile photo — two entry points, same action

- **Group profile (self):** Keep existing **change photo** flow (camera / file input) as today.
- **Account settings:** Same upload path and sync helper — **no second source of truth**. Both places update the same user avatar and group member denorm behavior already implemented.

---

## Implementation notes

- **Router:** Register `/settings` in `App.jsx` inside **`ProtectedRoute`**, **outside** `GroupLayout` (same level as `/` home), so the page does not show group chrome unless you explicitly wrap it — **recommend no group chrome** for settings to reinforce “global account.”
- **Reuse:** Extract shared “self profile photo” block from `GroupProfilePage` into a small component or shared hook **only if** it reduces duplication without a large refactor; otherwise duplicate the minimal JSX and **always** call the same service.
- **Title / header:** e.g. “Account settings” or “Settings” — avoid confusion with **Group settings** (`/group/:id/settings`).

---

## Acceptance checklist

- [x] `/settings` loads for signed-in users; unauthenticated users redirected per app auth rules.
- [x] Link to **Settings** on **home** header (next to sign out).
- [x] Link to **Settings** in **group** nav footer **below** “Home (all groups).”
- [x] Changing photo from **settings** updates the same data as **group self-profile** (same `uploadUserAvatarAndSyncGroups`; avatar read from `users/{uid}` live).
- [x] Sections exist for notifications and language (stub copy until notifications / i18n land).

---

## Future

- Deep links from notification payloads into the right group/screen.
- Richer language picker when i18n is introduced.
