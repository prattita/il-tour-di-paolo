import { getFirebaseApp } from './lib/firebase'

function App() {
  const firebaseReady = Boolean(getFirebaseApp())

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900">
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 py-12 text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
          Il Tour di Paolo
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-800">2026</h1>
        <p className="mt-4 max-w-sm text-sm text-slate-600">
          Foundation ready — React, Vite, Tailwind, Firebase config stub. Phase 2 adds
          auth and routing.
        </p>
        <p
          className={`mt-6 rounded-full px-3 py-1 text-xs font-medium ${
            firebaseReady
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-amber-100 text-amber-900'
          }`}
        >
          {firebaseReady
            ? 'Firebase env detected'
            : 'Set VITE_FIREBASE_* in .env (see .env.example)'}
        </p>
      </main>
    </div>
  )
}

export default App
