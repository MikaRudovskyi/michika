import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './en'
import ja from './ja'
import uk from './uk'
import enStays from './stays.en'
import jaStays from './stays.ja'
import ukStays from './stays.uk'
import enMap from './map.en'
import jaMap from './map.ja'
import ukMap from './map.uk'
import enSmart from './smart.en'
import jaSmart from './smart.ja'
import ukSmart from './smart.uk'
import enMedia from './media.en'
import jaMedia from './media.ja'
import ukMedia from './media.uk'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: { ...en, ...enStays, ...enMap, ...enSmart, ...enMedia } },
      uk: { translation: { ...uk, ...ukStays, ...ukMap, ...ukSmart, ...ukMedia } },
      ja: { translation: { ...ja, ...jaStays, ...jaMap, ...jaSmart, ...jaMedia } },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'uk', 'ja'],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  })

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng.slice(0, 2)
})

export default i18n