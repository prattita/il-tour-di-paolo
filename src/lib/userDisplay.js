function capitalizeWord(s) {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** First name for greetings: first word of display name, else email local-part (before @, first segment). */
export function firstNameFromUser(user) {
  const name = user?.displayName?.trim()
  if (name) {
    const first = name.split(/\s+/).filter(Boolean)[0]
    if (first) return first
  }
  const email = user?.email?.trim()
  if (email?.includes('@')) {
    const local = email.split('@')[0].split(/[._]/)[0]
    if (local) return capitalizeWord(local)
  }
  return null
}
