import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  GoogleAuthProvider,
} from 'firebase/auth'
import { getFirebaseAuth } from '../lib/firebase'

function requireAuth() {
  const auth = getFirebaseAuth()
  if (!auth) {
    throw new Error('Firebase Auth is not available. Check your .env / Vercel env vars.')
  }
  return auth
}

export async function signUpWithEmail(email, password, displayName) {
  const auth = requireAuth()
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName?.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() })
  }
  return cred.user
}

export async function signInWithEmail(email, password) {
  const auth = requireAuth()
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function signInWithGoogle() {
  const auth = requireAuth()
  const provider = new GoogleAuthProvider()
  const cred = await signInWithPopup(auth, provider)
  return cred.user
}

export async function signOutUser() {
  const auth = requireAuth()
  await signOut(auth)
}
