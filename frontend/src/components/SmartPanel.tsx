import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useLang } from '../hooks/useLang'
import { dateLocale, formatDate } from '../lib/format'
import { insightsApi } from '../lib/insightsApi'
import { EASE } from '../lib/motion'
import type { Itinerary } from '../lib/types'

const GOOD_REASONS = new Set(['low_crowds', 'mild_weather'])

// WMO weather codes, grouped.
function conditionKey(code: number | null): string | null {
  if (code === null) return null
  if (code <= 1) return 'clear'
  if (code <= 3) return 'cloudy'
  if (code <= 48) return 'fog'
  if (code <= 67 || (code >= 80 && code <= 82)) return 'rain'
  if (code <= 77 || (code >= 85 && code <= 86)) return 'snow'
  return 'storm'
}

interface Props {
  itinerary: Itinerary
  onPickDate: (iso: string) => void
}

export default function SmartPanel({ itinerary, onPickDate }: Props) {
  const { t } = useTranslation()
  const lang = useLang()
  const locale = dateLocale(lang)
  const qc = useQueryClient()
  const id = itinerary.id
  const startDate = itinerary.days[0]?.date ?? null

  const weather = useQuery({
    queryKey: ['insight', 'weather', id, itinerary.version, startDate, lang],
    queryFn: () => insightsApi.weather(id as string, lang),
    enabled: !!id && !!startDate,
  })
  const starts = useQuery({
    queryKey: ['insight', 'starts', id, itinerary.version],
    queryFn: () => insightsApi.startDates(id as string),
    enabled: !!id,
  })
  const alerts = useQuery({ queryKey: ['insight', 'alerts'], queryFn: insightsApi.alerts, staleTime: 300_000 })
  const snapshot = useMutation({
    mutationFn: () => insightsApi.snapshot(id as string),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['compare'] }),
  })

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------------- weather ---------------------------- */}
      <section className="glass p-6">
        <h2 className="text-xl mb-5">{t('smart.weather.title')}</h2>
        {!startDate && <p className="text-sm text-mist">{t('smart.weather.needDate')}</p>}
        {startDate && weather.isLoading && <p className="text-sm text-mist">{t('common.loading')}</p>}
        {weather.isError && <p className="text-sm text-red-300/80">{(weather.error as Error).message}</p>}

        {weather.data && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {weather.data.map((d) => {
              const cond = conditionKey(d.code)
              return (
                <div key={d.date} className="rounded-xl border border-white/10 p-4 flex flex-col gap-2">
                  <p className="text-xs text-mist">
                    {t('planner.day', { n: d.day + 1 })} · {formatDate(d.date, locale)}
                  </p>
                  <p className="font-serif text-2xl">
                    {d.temp_max !== null && d.temp_min !== null ? (
                      <>
                        {Math.round(d.temp_max)}°<span className="text-sm text-mist"> / {Math.round(d.temp_min)}°</span>
                      </>
                    ) : (
                      <>~{Math.round(d.temp_mean)}°</>
                    )}
                  </p>
                  {cond && <p className="text-xs">{t(`smart.cond.${cond}`)}</p>}

                  <div>
                    <div className="h-px bg-white/10 relative">
                      <motion.div
                        className="absolute inset-y-0 left-0 bg-gold"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round(d.rain_chance * 100)}%` }}
                        transition={{ duration: 0.8, ease: EASE }}
                      />
                    </div>
                    <p className="text-[11px] text-mist mt-1">{t('smart.weather.rain', { pct: Math.round(d.rain_chance * 100) })}</p>
                  </div>

                  <p className="text-[11px] text-mist/80">
                    {d.source === 'forecast' ? t('smart.weather.forecast') : t('smart.weather.typical')}
                  </p>

                  {d.flags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {d.flags.map((f) => (
                        <span key={f} className="text-[11px] rounded-full border border-amber-300/30 text-amber-200 px-2.5 py-0.5">
                          {t(`smart.flag.${f}`)}
                        </span>
                      ))}
                    </div>
                  )}

                  {d.alternatives.length > 0 && (
                    <div className="text-[11px] text-mist border-t border-white/10 pt-2">
                      <p className="mb-1">{t('smart.weather.indoor')}</p>
                      {d.alternatives.map((a) => (
                        <p key={a.id} className="text-washi">
                          {a.name} <span className="text-mist">· {a.distance_km} km</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* -------------------------- best time to go ----------------------- */}
      <section className="glass p-6">
        <h2 className="text-xl">{t('smart.best.title')}</h2>
        <p className="text-xs text-mist mt-1 mb-5">{t('smart.best.hint')}</p>

        {starts.isLoading && <p className="text-sm text-mist">{t('smart.best.loading')}</p>}
        {starts.isError && <p className="text-sm text-red-300/80">{(starts.error as Error).message}</p>}

        {starts.data && (
          <>
            {starts.data.current_score !== null && (
              <p className="text-sm mb-4">{t('smart.best.current', { score: Math.round(starts.data.current_score) })}</p>
            )}
            {starts.data.options.length === 0 && <p className="text-sm text-mist">{t('smart.best.none')}</p>}
            <ul className="flex flex-col gap-3">
              {starts.data.options.map((o) => {
                const active = o.start === startDate
                return (
                  <li key={o.start} className="rounded-xl border border-white/10 p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="min-w-[12rem]">
                      <p className="font-serif text-lg">
                        {formatDate(o.start, locale)}
                        {o.start !== o.end && ` – ${formatDate(o.end, locale)}`}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {o.reasons.map((r) => (
                          <span
                            key={r}
                            className={clsx(
                              'text-[11px] rounded-full border px-2.5 py-0.5',
                              GOOD_REASONS.has(r)
                                ? 'border-gold/40 text-gold'
                                : 'border-amber-300/30 text-amber-200',
                            )}
                          >
                            {t(`smart.reason.${r}`)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1 min-w-[8rem]">
                      <p className="text-xs text-mist mb-2">{Math.round(o.score)} / 100</p>
                      <div className="h-px bg-white/10 relative">
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-gold"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, Math.round(o.score))}%` }}
                          transition={{ duration: 0.8, ease: EASE }}
                        />
                      </div>
                    </div>

                    <button
                      className="btn btn-ghost !py-2 !px-5 text-xs"
                      disabled={active}
                      onClick={() => onPickDate(o.start)}
                    >
                      {active ? t('smart.best.selected') : t('smart.best.use')}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      {/* ----------------------------- alerts ----------------------------- */}
      {alerts.data?.configured && (
        <section className="glass p-6">
          <h2 className="text-xl mb-4">{t('smart.alerts.title')}</h2>
          {alerts.data.alerts.length === 0 ? (
            <p className="text-sm text-mist">{t('smart.alerts.none')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {alerts.data.alerts.map((a) => (
                <li key={`${a.operator}-${a.railway}`} className="text-sm">
                  <p className="text-amber-200">{a.railway.split(':').pop()}</p>
                  <p className="text-xs text-mist">{(lang === 'ja' ? a.text_ja : a.text_en) ?? a.text_ja ?? a.text_en}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------------------------- snapshot ---------------------------- */}
      <section className="glass p-6 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex-1 min-w-[14rem]">
          <h2 className="text-xl">{t('smart.snapshot.title')}</h2>
          <p className="text-xs text-mist mt-1">{t('smart.snapshot.text')}</p>
          {snapshot.isSuccess && <p className="text-xs text-gold mt-3">{t('smart.snapshot.saved')}</p>}
          {snapshot.isError && <p className="text-xs text-red-300/80 mt-3">{snapshot.error.message}</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-ghost" disabled={!id || snapshot.isPending} onClick={() => snapshot.mutate()}>
            {snapshot.isPending ? t('smart.snapshot.saving') : t('smart.snapshot.save')}
          </button>
          <Link to="/compare" className="btn btn-primary">
            {t('smart.snapshot.open')}
          </Link>
        </div>
      </section>
    </div>
  )
}