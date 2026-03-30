/** Shared palette for initials avatars (matches feed mock tints). */
export const AVATAR_PALETTE = [
  { bg: 'bg-[#B5D4F4]', text: 'text-[#0C447C]' },
  { bg: 'bg-[#9FE1CB]', text: 'text-[#085041]' },
  { bg: 'bg-[#CECBF6]', text: 'text-[#26215C]' },
  { bg: 'bg-[#F5C4B3]', text: 'text-[#4A1B0C]' },
]

export function hashString(s) {
  let h = 0
  const str = s || 'x'
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

export function avatarInitials(displayName, email) {
  const name = displayName?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  const em = email?.trim()
  if (em) return em.slice(0, 2).toUpperCase()
  return '??'
}
