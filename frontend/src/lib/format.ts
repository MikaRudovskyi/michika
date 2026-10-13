const yen = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
})

export const formatYen = (value: number) => yen.format(value)

export const formatTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export const todayISO = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export const dateLocale = (lang: string) =>
  (({ uk: 'uk-UA', ja: 'ja-JP' }) as Record<string, string>)[lang] ?? 'en-GB'

export const formatDate = (iso: string, locale: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })