# Il Tour di Paolo 2026

Private family competition app — see [`docs/DESIGN.md`](./docs/DESIGN.md).

**Local learning primers (gitignored — copy filenames into `docs/` on your machine):**

- `docs/firebase-browser-key-restrictions-PRIMER.md` — restrict the web API key to your domains (Google Cloud Console).
- `docs/firebase-emulators-PRIMER.md` — local Auth/Firestore/Storage emulators (optional).

These match `.gitignore` patterns `docs/*PRIMER*.md` / `docs/*primer*.md`. **DESIGN.md** and other non-primer docs under `docs/` stay tracked.

## Local dev

```bash
npm install
npm run dev
```

## Phase 1 — Foundation (setup)

| Step | What you do |
|------|-------------|
| **Firebase project** | [Firebase Console](https://console.firebase.google.com) → create project → enable **Authentication** (Email/Password), **Firestore**, **Storage** (Blaze if required for Storage). |
| **Web app config** | Project settings → Your apps → add Web app → copy config. |
| **Env vars** | `cp .env.example .env` and paste `VITE_FIREBASE_*` values. `VITE_FIREBASE_MEASUREMENT_ID` is optional (Analytics). Never commit `.env`. |
| **Deploy rules** | Install [Firebase CLI](https://firebase.google.com/docs/cli), `firebase login`, **`firebase use --add`** (pick project — creates `.firebaserc`). Then `firebase deploy --only firestore:rules,storage`. You usually **don’t need `firebase init`** — this repo already has `firebase.json` + rules files. |
| **Vercel** | See **[Deploy to Vercel](#deploy-to-vercel)** below. |

Repo files:

- `firestore.rules` / `storage.rules` — match **§10** in `docs/DESIGN.md` (test in emulator before production).
- `firebase.json` — wires rules for CLI deploy.
- `src/lib/firebase.js` — reads `import.meta.env.VITE_*` and initializes the app when config is complete.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |

## Deploy to Vercel

Do this **after** your app is pushed to **GitHub** (Vercel pulls from git).

### One-time: Vercel project

1. Go to [vercel.com](https://vercel.com) → sign in (GitHub is easiest).
2. **Add New… → Project** → **Import** your `il-tour-di-paolo` repository.
3. Vercel should detect **Vite** automatically:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install` (default)
4. Expand **Environment Variables** and add **the same names and values** as your local `.env` (all `VITE_FIREBASE_*` keys, including optional `VITE_FIREBASE_MEASUREMENT_ID` if you use it).  
   - Use **Production** (and **Preview** if you want PR previews to talk to Firebase too).
5. Click **Deploy**.

`vercel.json` includes an SPA **rewrite** so future React Router routes (e.g. `/auth`) work on refresh.

### One-time: Firebase Auth + your Vercel URL

After the first deploy, Vercel gives you a URL like `https://il-tour-di-paolo.vercel.app` (or your team slug).

1. **Firebase Console** → **Authentication** → **Settings** → **Authorized domains**.
2. **Add domain** → enter your `*.vercel.app` host (no `https://`).
3. If you add a **custom domain** in Vercel later, add that domain here too.

Without this step, **Google / email sign-in can fail** on the deployed site even when localhost works.

### Verify

- Open the production URL → you should see the app and **“Firebase env detected”** if vars are set correctly.
- Run **`npm run build`** locally before pushing; fix any build errors so Vercel doesn’t fail.

---

## Stack

React 19, Vite 8, Tailwind CSS 4, Firebase (Auth, Firestore, Storage), Vercel hosting.
