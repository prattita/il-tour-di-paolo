import { useState } from 'react'
import { getFirebaseApp } from '../lib/firebase'
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
} from '../services/authService'

const inputClass =
  'min-h-11 w-full rounded-lg border border-black/18 bg-tour-surface px-3 py-2.5 text-tour-text shadow-sm focus:border-tour-accent focus:outline-none focus:ring-1 focus:ring-tour-accent'

export function AuthPage() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const firebaseReady = Boolean(getFirebaseApp())

  async function handleEmailSubmit(e) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName)
      } else {
        await signInWithEmail(email, password)
      }
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setPending(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setPending(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err.message || 'Google sign-in failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="min-h-dvh bg-tour-muted text-tour-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-8 sm:px-5 sm:py-10">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-xl border border-black/10 bg-tour-surface p-5 sm:p-6">
            <header className="mb-6 text-center sm:text-left">
              <p className="text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
                Il Tour di Paolo
              </p>
              <h1 className="mt-1 text-xl font-semibold text-tour-text sm:text-2xl">
                {mode === 'login' ? 'Sign in' : 'Create an account'}
              </h1>
              <p className="mt-2 text-sm text-tour-text-secondary">
                {mode === 'login'
                  ? 'Use your email or Google to continue.'
                  : 'Set a display name your group will see.'}
              </p>
            </header>

            {!firebaseReady && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-sm text-amber-900">
                Firebase is not configured. Add <code className="text-xs">VITE_FIREBASE_*</code> to{' '}
                <code className="text-xs">.env</code> (or Vercel env).
              </div>
            )}

            <div className="mb-6 flex rounded-xl border border-black/10 bg-tour-muted p-1">
              <button
                type="button"
                className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition-colors ${
                  mode === 'login'
                    ? 'bg-tour-surface text-tour-text shadow-sm'
                    : 'text-tour-text-secondary hover:text-tour-text'
                }`}
                onClick={() => {
                  setMode('login')
                  setError('')
                }}
              >
                Log in
              </button>
              <button
                type="button"
                className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-medium transition-colors ${
                  mode === 'signup'
                    ? 'bg-tour-surface text-tour-text shadow-sm'
                    : 'text-tour-text-secondary hover:text-tour-text'
                }`}
                onClick={() => {
                  setMode('signup')
                  setError('')
                }}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
              {mode === 'signup' && (
                <div>
                  <label htmlFor="displayName" className="mb-1.5 block text-sm font-medium text-tour-text">
                    Display name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={inputClass}
                    required={mode === 'signup'}
                  />
                </div>
              )}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-tour-text">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-tour-text">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  required
                  minLength={6}
                />
                {mode === 'signup' && (
                  <p className="mt-1.5 text-xs text-tour-text-secondary">
                    At least 6 characters (Firebase default).
                  </p>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={pending || !firebaseReady}
                className="min-h-11 w-full rounded-lg bg-tour-accent px-4 py-3 text-sm font-medium text-white hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-black/10" />
              </div>
              <div className="relative flex justify-center text-[11px] font-medium uppercase tracking-wide text-tour-text-secondary">
                <span className="bg-tour-surface px-3">or</span>
              </div>
            </div>

            <button
              type="button"
              disabled={pending || !firebaseReady}
              onClick={handleGoogle}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-black/10 bg-tour-muted px-4 py-3 text-sm font-medium text-tour-text hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <GoogleIcon />
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}
