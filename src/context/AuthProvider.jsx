import { useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { getFirebaseAuth } from '../lib/firebase'
import { ensureNotificationDefaults, ensureUserProfile } from '../services/userService'
import { AuthContext } from './authContext'

export function AuthProvider({ children }) {
  const auth = getFirebaseAuth()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(auth))

  useEffect(() => {
    if (!auth) {
      return
    }

    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) {
        try {
          await ensureUserProfile(nextUser.uid, {
            email: nextUser.email || '',
            displayName: nextUser.displayName,
            avatarUrl: nextUser.photoURL || null,
          })
          await ensureNotificationDefaults(nextUser.uid)
        } catch (e) {
          console.error('[auth] ensureUserProfile failed', e)
        }
      }
      setUser(nextUser)
      setLoading(false)
    })

    return () => unsub()
  }, [auth])

  const value = { user, loading }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
