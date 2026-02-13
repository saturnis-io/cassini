import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Import locale files
import commonEn from './locales/en/common.json'
import navigationEn from './locales/en/navigation.json'
import authEn from './locales/en/auth.json'
import dashboardEn from './locales/en/dashboard.json'
import settingsEn from './locales/en/settings.json'
import violationsEn from './locales/en/violations.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: commonEn,
        navigation: navigationEn,
        auth: authEn,
        dashboard: dashboardEn,
        settings: settingsEn,
        violations: violationsEn,
      },
    },
    defaultNS: 'common',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'openspc-language',
    },
  })

export default i18n
