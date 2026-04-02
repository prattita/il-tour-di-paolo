export const STORAGE_KEY = 'il_tour_language'
export const DEFAULT_LANGUAGE = 'en'
export const SUPPORTED_LANGUAGES = ['en', 'es', 'it']

export function getStoredLanguage() {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return SUPPORTED_LANGUAGES.includes(stored) ? stored : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function storeLanguage(lang) {
  if (typeof window === 'undefined' || !SUPPORTED_LANGUAGES.includes(lang)) return
  try {
    window.localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore quota / private mode */
  }
}
