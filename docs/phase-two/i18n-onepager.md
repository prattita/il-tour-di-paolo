# Internationalisation (i18n) — Mini spec

> Status: **Phase Two — in progress** (skeleton + Settings fully wired; rest of app English until audit)  
> Last updated: April 2026  
> Related: [Account settings](settingsPage-onepager.md), [Notifications](notifications-onepager.md), [DESIGN.md](../mvp/DESIGN.md)

---

## Goal

Support **three UI languages**: **English (default)**, **Spanish**, **Italian**. Only **app chrome** is translated (labels, empty states, errors, system copy). **User-generated content** (group names, activity/task names, descriptions, feed posts) stays as entered.

Language preference is **per device**, stored in **`localStorage`**, applied on load without a full page reload. No Firestore field required for v1.

---

## Approach: lightweight vs i18next

| | **Option A — Lightweight** (`t()` + context + JSON/JS maps) | **Option B — i18next + react-i18next** |
|---|------|------|
| **Dependencies** | None | Two packages (~13KB gzipped combined; larger API surface) |
| **Pluralisation** | Manual if needed | Built-in per locale |
| **Interpolation** | Small `{{name}}` helper once | Built-in |
| **Tooling** | DIY (grep, CI checks optional) | Parsers, missing-key plugins, `<Trans>` for rich text |
| **Learning / debug** | Entire system readable in one sitting | More concepts (namespaces, backends, …) |
| **Migration** | Structure keys like i18next from day one → swap wiring later | N/A |

### Recommendation (implement first)

**Start with Option A (lightweight).**

- Your scope is **three languages** and a **finite, family-scale** string set — you are unlikely to hit pluralisation complexity immediately (and where you do, a couple of explicit keys like `medalCount_one` / `medalCount_other` is fine).
- **Zero dependencies** and a **thin** `useTranslation` / `t()` API keep the codebase easy for you and for Cursor-assisted passes.
- The doc’s **i18next-shaped keys** (`welcomeBack`, not English sentences as keys) mean **migration to Option B later is mostly**: install packages, convert maps to JSON, replace the hook implementation — **call sites stay `t('key')`**.
- Choose **Option B first** if you already know you want **i18next-parser in CI**, **many plural rules**, or **4+ languages** in the next few months.

---

## Scope (v1)

- **`en` / `es` / `it`** translation modules with **matching semantic keys** (nested or flat — pick one convention and stick to it).
- **`LanguageProvider`** + **`useTranslation()`** with `t(key, vars?)` and safe fallback when a key is missing (e.g. show key or English fallback — product choice).
- **`localStorage`** persistence with allowlist `['en','es','it']` and default `'en'`.
- **Language control in [Account settings](settingsPage-onepager.md)** (`/settings` → Language section) — aligns with the shipped settings page stub.
- **Optional:** compact language control in **group nav** (e.g. under user block) for quick switching without opening settings — only if you want two entry points; otherwise **settings-only** avoids duplication.

Iterative **string audit by screen** (see checklist below); avoid one giant PR.

---

## Out of scope (v1)

- Storing `preferredLanguage` on **`users/{uid}`** (cross-device sync) — additive later.
- Translating **UGC** or **dates/numbers** with full locale formatting (can layer `Intl` later).
- Lazy-loading translation bundles (file size does not justify it yet).
- SSR / static extraction pipeline unless you adopt i18next tooling.

---

## Storage

- **`localStorage`** persists across sessions on the same device; no Firestore read/write for v1.
- Invalid stored values fall back to **`en`** so old keys never brick the app.

---

## Internal implementation (shipped skeleton)

- `src/i18n/translations/{en,es,it}.js` — nested objects; **`t('settings.pageTitle')`**-style dot paths.
- `src/i18n/storage.js` — `localStorage` key `il_tour_language`, allowlist `en` / `es` / `it`.
- `src/i18n/translate.js` — `messageAt` (nested lookup) + `interpolate` for `{{var}}`.
- `src/i18n/index.js` — `translations` map.
- `src/context/LanguageContext.jsx` — `LanguageProvider`, `useLanguage()`, `t` with **English fallback** then key; sets `document.documentElement.lang`.
- `src/hooks/useTranslation.js` — `{ t, language, changeLanguage }`.
- **`main.jsx`** wraps `<App />` with `<LanguageProvider>` (outside router; inside `StrictMode`).

**First fully wired screen:** [`SettingsPage`](../src/pages/SettingsPage.jsx) (header, back link, language pills, profile/notifications copy). Other routes stay hardcoded English until audit passes.

**Convention:** semantic dot keys, never English prose as the key.

**Later migration to i18next:** install packages, init i18next, re-export hook — call sites stay `t('…')` if keys match.

**Plurals (lightweight):** use two keys (e.g. `home.membersCount_one` / `home.membersCount_other`) and pick by `count === 1` in the component. For locales with more plural forms (e.g. Polish), add branches or migrate to i18next plural rules.

---

## String audit — recommended order

Ship **pass-by-pass** (small PRs):

1. **Auth + Home** — `/auth`, `/` — **done** (`AuthPage`, `HomePage`; keys under `auth`, `home`, `common`, `errors`)
2. **Join + create group** — `/join`, `/join/:inviteCode`, `/group/new` — **done** (`JoinGroupPage`, `CreateGroupPage`; keys under `join`, `groupNew`, extended `errors`; `translateGroupServiceError` in `src/i18n/groupServiceErrors.js`)
3. **Group shell + nav** — `GroupLayout` — **done** (keys under `groupShell`; reuses `home.settings`, `home.signOut`, `common.brandLine`)
4. **Feed** — **done** (`GroupFeedPage`, `FeedPostCard`, `FeedPhotoCarousel`, `FeedPhotoLightbox` / expand button, `MedalBadge` on feed); keys under `feed`, `medals`
5. **Activities + task complete** — **done** (`ActivityListPage`, `TaskCompletePage`; keys under `activities`, `taskComplete`; reuses `feed.*`, `groupShell.*`, `settings.back`, `common.brandLine`)
6. **Profile + group info + standings** — **done** (`GroupProfilePage`, `GroupInfoPage`, `GroupStandingsPage`, `UserTracker`, `StandingsRankMarker`; keys under `groupInfo`, `profile`, `standings`; ordinals via `formatStandingsOrdinal(n, language)`)
7. **Approvals + group settings** — **done** (`GroupApprovalsPage`, `GroupSettingsPage`; keys `approvals`, `groupSettings`; reuses `feed.*`, `groupShell.*`, `groupInfo.*`, `groupNew.*`, `activities.*`, `common.brandLine`)
8. **Errors, banners, toasts** — **done** (auth route loaders `ProtectedRoute` / `PublicOnlyRoute`; `PageLoading` default label; `useGroupCompletionPickerData` error fallbacks; `SettingsPage` profile/avatar strings + lightbox aria; `GroupFeedPage` comment displayName fallback; `formatFeedTime` relative labels + `Intl` locale; `stub.*` for `GroupStubPage`; advanced/rejection banners were already keyed in pass 5–6)

**Translate:** buttons, headings, empty states, errors, placeholders, system feed templates, medal **labels** in UI.  
**Do not translate:** user names, emails, group/activity/task/post body text, proper noun **Il Tour di Paolo** (unless you later decide a localized brand line).  
**Product copy:** Spanish and Italian keep the English loanword **Feed** for the feed surface (e.g. nav label `groupShell.navFeed`, filter heading `feed.filterHeading`, error `feed.errorLoadFeed`), not a translated synonym.

---

## Acceptance checklist

### Setup

- [x] `en` / `es` / `it` translation files with aligned keys (expand per audit)
- [x] `LanguageProvider` at app root (`main.jsx`)
- [x] `useTranslation` + storage + nested `t()` + EN fallback

### Product

- [x] Language choice on **`/settings`** updates UI immediately
- [x] Preference survives tab close / reopen (`localStorage`)
- [x] Invalid `localStorage` value falls back to English
- [x] Missing key → EN string, then key string; dev `console.warn`

### Audit

- [x] Pass 1 — Auth + Home
- [x] Pass 2 — Join + create group (`JoinGroupPage`, `CreateGroupPage`)
- [x] Pass 3 — Group shell + nav (`GroupLayout`)
- [x] Pass 4 — Feed (+ shared `MedalBadge`, photo lightbox strings)
- [x] Pass 5 — Activities + task complete (`ActivityListPage`, `TaskCompletePage`)
- [x] Pass 6 — Profile + group info + standings
- [x] Pass 7 — Approvals + group settings (`GroupApprovalsPage`, `GroupSettingsPage`)
- [x] Pass 8 — Errors, banners, toasts (route loaders, shared hooks, feed timestamps, settings polish)

---

## Rejected alternatives

| Approach | Why |
|----------|-----|
| Positional arrays per string across languages | Reordering languages breaks everything |
| English sentence as `t()` key | Typos break lookups; semantic keys stay stable |
| Firestore-only language for v1 | Unnecessary cost and auth timing for a per-device preference |
| Language **only** in drawer, never on `/settings` | Conflicts with shipped Account settings **Language** stub — settings should be canonical unless product chooses drawer-only and removes the stub |

---

## Future

- **`users.preferredLanguage`** + reconcile with `localStorage` if cross-device matters.
- **i18next** if tooling, plurals, or language count outgrow the lightweight layer.
- **`Intl`** for dates/numbers per locale.
