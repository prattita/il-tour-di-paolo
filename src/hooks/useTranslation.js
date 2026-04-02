import { useLanguage } from '../context/LanguageContext.jsx'

/** Same call shape as react-i18next: t('settings.pageTitle'), t('key', { name: 'x' }). */
export function useTranslation() {
  const { t, language, changeLanguage } = useLanguage()
  return { t, language, changeLanguage }
}
