# Il Tour di Paolo 2026

Private family competition app — see [`DESIGN.md`](./DESIGN.md).

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
| **Env vars** | `cp .env.example .env` and paste `VITE_FIREBASE_*` values. Never commit `.env`. |
| **Deploy rules** | Install [Firebase CLI](https://firebase.google.com/docs/cli), run `firebase login`, `firebase use <your-project-id>`, then `firebase deploy --only firestore:rules,storage`. |
| **Vercel** | Import the GitHub repo → Framework Preset **Vite** → add the same `VITE_FIREBASE_*` env vars in Vercel → deploy. |

Repo files:

- `firestore.rules` / `storage.rules` — match **§10** in `DESIGN.md` (test in emulator before production).
- `firebase.json` — wires rules for CLI deploy.
- `src/lib/firebase.js` — reads `import.meta.env.VITE_*` and initializes the app when config is complete.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |

## Stack

React 19, Vite 8, Tailwind CSS 4, Firebase (Auth, Firestore, Storage), Vercel hosting.
