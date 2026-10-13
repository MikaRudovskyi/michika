import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useLang } from '../hooks/useLang'
import { dateLocale, formatDate, formatYen } from '../lib/format'
import { insightsApi } from '../lib/insightsApi'
import type { RouteMetrics } from '../lib/insightsApi'

interface Row {
  label: string
  value: (r: RouteMetrics) => string
  best?: string // key in `best` from the API
  strong?: boolean
}

export default function Compare() {
  const { t } = useTranslation()
  const lang = useLang()
  const locale = dateLocale(lang)
  const [selected, setSelected] = useState<string[]>([])

  const candidates = useQuery({ queryKey: ['compare', 'candidates'], queryFn: insightsApi.candidates })
  const result = useQuery({
    queryKey: ['compare', 'result', selected.join(','), lang],
    queryFn: () => insightsApi.compare(selected, lang),
    enabled: selected.length >= 2,
  })

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]))

  const hm = (min: number) => t('smart.compare.hm', { h: Math.floor(min / 60), m: min % 60 })

  const rows: Row[] = [
    { label: t('smart.compare.cost'), value: (r) => formatYen(r.total_jpy), best: 'cheapest', strong: true },
    { label: t('smart.compare.perPerson'), value: (r) => formatYen(r.per_person_jpy) },
    { label: t('smart.compare.perDay'), value: (r) => formatYen(r.per_day_jpy) },
    {
      label: t('smart.compare.budget'),
      value: (r) =>
        `${r.budget_used_pct}% · ${r.within_budget ? t('smart.compare.withinBudget') : t('smart.compare.overBudget')}`,
    },
    { label: t('smart.compare.days'), value: (r) => String(r.days) },
    { label: t('smart.compare.sites'), value: (r) => String(r.stops), best: 'most_sites' },
    { label: t('smart.compare.active'), value: (r) => hm(r.activity_min) },
    { label: t('smart.compare.travel'), value: (r) => hm(r.transit_min), best: 'fewest_transit' },
    {
      label: t('smart.compare.crowd'),
      value: (r) => (r.stops ? `${Math.round(r.avg_crowd * 100)}%` : '–'),
      best: 'quietest',
    },
    { label: t('smart.compare.entry'), value: (r) => formatYen(r.entry_fees_jpy) },
    { label: t('smart.compare.transport'), value: (r) => formatYen(r.transport_jpy) },
    { label: t('smart.compare.lodging'), value: (r) => formatYen(r.lodging_jpy) },
    { label: t('smart.compare.extras'), value: (r) => formatYen(r.extras_jpy) },
    { label: t('smart.compare.warnings'), value: (r) => String(r.warnings) },
  ]

  const data = result.data
  const nameOf = (id: string) => data?.site_names[id] ?? '–'

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24">
      <header className="py-12">
        <p className="eyebrow mb-4">{t('smart.compare.subtitle')}</p>
        <h1 className="text-4xl sm:text-5xl">{t('smart.compare.title')}</h1>
      </header>

      {candidates.isLoading && <p className="text-mist">{t('common.loading')}</p>}
      {candidates.isError && <p className="text-red-300/80">{(candidates.error as Error).message}</p>}

      {candidates.data && candidates.data.length === 0 && (
        <div className="glass p-10 text-center">
          <p className="text-sm text-mist mb-6">{t('smart.compare.empty')}</p>
          <Link to="/planner" className="btn btn-primary">
            {t('smart.compare.planner')}
          </Link>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mb-10">
        {candidates.data?.map((c) => {
          const on = selected.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className={clsx(
                'glass p-5 text-left transition-colors duration-500 ease-calm',
                on ? 'border-gold/60' : 'hover:border-white/25',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-serif text-lg">
                  {c.days} · {formatYen(c.total_jpy)}
                </p>
                <span
                  className={clsx(
                    'h-4 w-4 rounded-full border',
                    on ? 'bg-gold border-gold' : 'border-white/30',
                  )}
                />
              </div>
              <p className="text-xs text-mist mt-2">
                {c.start_date ? t('smart.compare.startsOn', { date: formatDate(c.start_date, locale) }) : t('smart.compare.noDate')}
                {' · '}
                {c.stops} {t('smart.compare.sites').toLowerCase()} · {t('smart.compare.version', { n: c.version })}
              </p>
              <p className="text-[11px] text-mist/70 mt-1">{new Date(c.updated_at).toLocaleDateString(locale)}</p>
            </button>
          )
        })}
      </div>

      {selected.length < 2 && candidates.data && candidates.data.length > 0 && (
        <p className="text-sm text-mist">{t('smart.compare.pick')}</p>
      )}
      {result.isError && <p className="text-red-300/80">{(result.error as Error).message}</p>}

      {data && selected.length >= 2 && (
        <div className="flex flex-col gap-8">
          <div className="glass overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-5 py-4 w-48" />
                  {data.routes.map((r, i) => (
                    <th key={r.id} className="px-5 py-4 font-normal align-top">
                      <p className="font-serif text-lg">{t('smart.compare.route', { n: i + 1 })}</p>
                      <p className="text-xs text-mist">
                        {r.start_date
                          ? t('smart.compare.startsOn', { date: formatDate(r.start_date, locale) })
                          : t('smart.compare.noDate')}
                      </p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-b border-white/5">
                    <td className="px-5 py-3 text-xs text-mist">{row.label}</td>
                    {data.routes.map((r) => {
                      const isBest = !!row.best && data.best[row.best] === r.id
                      return (
                        <td
                          key={r.id}
                          className={clsx(
                            'px-5 py-3',
                            row.strong && 'font-serif text-lg',
                            isBest ? 'text-gold' : 'text-washi',
                          )}
                        >
                          {row.value(r)}
                          {isBest && <span className="ml-2 text-[11px] text-gold/80">★ {t('smart.compare.best')}</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="glass p-6">
              <h2 className="text-xl mb-4">{t('smart.compare.shared')}</h2>
              <div className="flex flex-wrap gap-2">
                {data.shared_site_ids.length === 0 && <span className="text-sm text-mist">–</span>}
                {data.shared_site_ids.map((id) => (
                  <span key={id} className="chip chip-active cursor-default">
                    {nameOf(id)}
                  </span>
                ))}
              </div>
            </div>

            <div className="glass p-6 flex flex-col gap-5">
              {data.routes.map((r, i) => {
                const own = r.site_ids.filter((id) => !data.shared_site_ids.includes(id))
                return (
                  <div key={r.id}>
                    <p className="text-xs text-mist mb-2">
                      {t('smart.compare.route', { n: i + 1 })} · {t('smart.compare.only')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {own.length === 0 && <span className="text-sm text-mist">–</span>}
                      {own.map((id) => (
                        <span key={id} className="chip cursor-default">
                          {nameOf(id)}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}