import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LANGUAGE, translations } from '../i18n/index.js'
import { getStoredLanguage, storeLanguage } from '../i18n/storage.js'
import { interpolate, messageAt } from '../i18n/translate.js'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getStoredLanguage)

  const changeLanguage = useCallback((lang) => {
    if (!translations[lang]) return
    setLanguage(lang)
    storeLanguage(lang)
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = useMemo(() => {
    const messages = translations[language] || translations[DEFAULT_LANGUAGE]
    const fallbackMessages = translations[DEFAULT_LANGUAGE]

    function t(key, vars) {
      let raw = messageAt(messages, key)
      if (raw == null && language !== DEFAULT_LANGUAGE) {
        raw = messageAt(fallbackMessages, key)
      }
      if (raw == null) {
        if (import.meta.env.DEV) {
          console.warn(`[i18n] missing key: ${key}`)
        }
        return key
      }
      return interpolate(raw, vars)
    }

    return {
      language,
      changeLanguage,
      t,
    }
  }, [language, changeLanguage])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return ctx
}
