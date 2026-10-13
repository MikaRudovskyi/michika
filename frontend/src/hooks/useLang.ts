import { useTranslation } from 'react-i18next'
import type { Lang } from '../lib/types'

export function useLang(): Lang {
  const { i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? 'en'
  return (['en', 'uk', 'ja'].includes(lang) ? lang : 'en') as Lang
}