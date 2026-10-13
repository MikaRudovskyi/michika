import { useMutation, useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import BestTimeDialog from '../components/BestTimeDialog'
import InterestPicker from '../components/InterestPicker'
import SmartPanel from '../components/SmartPanel'
import StaysSection from '../components/StaysSection'
import { useLang } from '../hooks/useLang'
import { api } from '../lib/api'
import { dateLocale, formatDate, formatTime, formatYen, todayISO } from '../lib/format'
import type { Focus } from '../lib/mapGeo'
import { EASE } from '../lib/motion'
import type { PlanForm } from '../lib/types'
import { useAuth } from '../store/auth'
import { usePlanner } from '../store/planner'

// MapLibre is large: load it only once there is a route to show.
const RouteMapPanel = lazy(() => import('../components/map/RouteMapPanel'))

const sigOf = (f: PlanForm) =>
  JSON.stringify([f.days, f.budget_jpy, f.travelers, [...f.interests].sort(), f.start_date])

export default function Planner() {
  const { t } = useTranslation()
  const lang = useLang()
  const user = useAuth((s) => s.user)
  const { form, itinerary, diff, patch, prefill, setResult } = usePlanner()
  const [focus, setFocus] = useState<Focus | null>(null)
  const [bestTimeSite, setBestTimeSite] = useState<string | null>(null)
  // If a route already exists when the page mounts, the form matches it: don't rebuild right away.
  const lastSig = useRef(itinerary ? sigOf(form) : '')

  // Sites by id (the itinerary only stores ids): names for the timeline, coordinates for the map
  const sitesQ = useQuery({
    queryKey: ['sites', 'planner', lang],
    queryFn: () => api.sites({ sort: 'popularity', limit: 100 }, lang),
  })
  const sites = useMemo(
    () => new Map((sitesQ.data?.items ?? []).map((s) => [s.id, s])),
    [sitesQ.data],
  )
  const nameOf = (id: string) => sites.get(id)?.name ?? id

  useEffect(() => {
    if (user) prefill(user.prefs)
  }, [user, prefill])

  const generate = useMutation({
    mutationFn: () => api.generate(usePlanner.getState().form),
    onSuccess: (it) => {
      lastSig.current = sigOf(usePlanner.getState().form)
      setResult(it, null)
    },
  })

  const rebuild = useMutation({
    mutationFn: (id: string) => api.rebuild(id, usePlanner.getState().form),
    onSuccess: (r) => setResult(r.itinerary, r.diff),
  })

  // Dynamic auto-rebuild: any parameter change re-composes the saved route after a short pause.
  const sig = sigOf(form)
  const itineraryId = itinerary?.id ?? null
  useEffect(() => {
    if (!itineraryId || sig === lastSig.current) return
    const timer = setTimeout(() => {
      lastSig.current = sig
      rebuild.mutate(itineraryId)
    }, 700)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, itineraryId])

  const showOnMap = (siteId: string) => {
    setFocus({ id: siteId, nonce: Date.now() })
    document.getElementById('route-map')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const busy = generate.isPending || rebuild.isPending
  const error = (generate.error ?? rebuild.error) as Error | null
  const cost = itinerary?.cost

  const breakdown = cost
    ? [
        { key: 'entry', value: cost.entry_fees_jpy },
        { key: 'transport', value: cost.transport_jpy },
        { key: 'lodging', value: cost.lodging_jpy },
        { key: 'extras', value: cost.extras_jpy },
      ]
    : []

  const hasChanges = diff && (diff.added.length || diff.removed.length || diff.moved.length)

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24">
      <header className="py-12">
        <p className="eyebrow mb-4">{t('planner.subtitle')}</p>
        <h1 className="text-4xl sm:text-5xl">{t('planner.title')}</h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[360px_1fr] items-start">
        {/* ---------- controls ---------- */}
        <aside className="glass p-6 flex flex-col gap-7 lg:sticky lg:top-28">
          <div>
            <p className="text-xs text-mist mb-3">{t('stays.startDate')}</p>
            <input
              type="date"
              className="input [color-scheme:dark]"
              min={todayISO()}
              value={form.start_date}
              onChange={(e) => patch({ start_date: e.target.value })}
            />
          </div>

          <div>
            <p className="text-xs text-mist mb-3 flex justify-between">
              <span>{t('planner.days')}</span>
              <span className="text-washi">{form.days}</span>
            </p>
            <input type="range" min={1} max={14} value={form.days} onChange={(e) => patch({ days: +e.target.value })} />
          </div>

          <div>
            <p className="text-xs text-mist mb-3 flex justify-between">
              <span>{t('planner.budget')}</span>
              <span className="text-washi">{formatYen(form.budget_jpy)}</span>
            </p>
            <input
              type="range"
              min={30_000}
              max={1_000_000}
              step={10_000}
              value={form.budget_jpy}
              onChange={(e) => patch({ budget_jpy: +e.target.value })}
            />
          </div>

          <div>
            <p className="text-xs text-mist mb-3 flex justify-between">
              <span>{t('planner.travelers')}</span>
              <span className="text-washi">{form.travelers}</span>
            </p>
            <input type="range" min={1} max={10} value={form.travelers} onChange={(e) => patch({ travelers: +e.target.value })} />
          </div>

          <div>
            <p className="text-xs text-mist mb-3">{t('planner.interests')}</p>
            <InterestPicker value={form.interests} onChange={(interests) => patch({ interests })} />
          </div>

          {!itinerary && (
            <button className="btn btn-primary" disabled={busy} onClick={() => generate.mutate()}>
              {generate.isPending ? t('planner.generating') : t('planner.generate')}
            </button>
          )}
          {itinerary && (
            <p className={clsx('text-xs h-4 transition-opacity duration-500', busy ? 'text-gold opacity-100' : 'opacity-0')}>
              {t('planner.rebuilding')}
            </p>
          )}
          {error && <p className="text-sm text-red-300/80">{error.message}</p>}
        </aside>

        {/* ---------- result ---------- */}
        <section>
          {!itinerary && (
            <div className="glass p-12 text-center">
              <h2 className="text-2xl mb-3">{t('planner.emptyTitle')}</h2>
              <p className="text-mist text-sm">{t('planner.emptyText')}</p>
            </div>
          )}

          {itinerary && cost && (
            <div className={clsx('flex flex-col gap-6 transition-opacity duration-500', busy && 'opacity-60')}>
              {/* cost */}
              <div className="glass p-8">
                <p className="text-xs text-mist mb-2">{t('planner.total')}</p>
                <p className="font-serif text-5xl text-gold">{formatYen(cost.total_jpy)}</p>
                <p className="text-xs text-mist mt-3">
                  {formatYen(cost.per_person_jpy)} {t('planner.perPerson')} · {t('planner.range')}{' '}
                  {formatYen(cost.low_jpy)} – {formatYen(cost.high_jpy)}
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {breakdown.map((b) => (
                    <div key={b.key}>
                      <div className="flex justify-between text-xs text-mist mb-2">
                        <span>{t(`planner.${b.key}`)}</span>
                        <span className="text-washi">{formatYen(b.value)}</span>
                      </div>
                      <div className="h-px bg-white/10 relative">
                        <motion.div
                          className="absolute inset-y-0 left-0 bg-gold"
                          animate={{ width: `${cost.total_jpy ? (b.value / cost.total_jpy) * 100 : 0}%` }}
                          transition={{ duration: 0.9, ease: EASE }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* map */}
              <Suspense
                fallback={
                  <div className="glass h-[440px] grid place-items-center text-xs text-mist">
                    {t('map.loading')}
                  </div>
                }
              >
                <RouteMapPanel
                  itinerary={itinerary}
                  sites={sites}
                  startDate={itinerary.days[0]?.date ?? null}
                  focus={focus}
                />
              </Suspense>

              {/* weather, best time to go, alerts, snapshots */}
              <SmartPanel itinerary={itinerary} onPickDate={(iso) => patch({ start_date: iso })} />

              {/* diff */}
              <AnimatePresence>
                {hasChanges && (
                  <motion.div
                    key={itinerary.version}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: EASE }}
                    className="glass p-5 flex flex-wrap gap-x-8 gap-y-3 text-xs"
                  >
                    {diff.added.length > 0 && (
                      <p>
                        <span className="text-gold mr-2">+ {t('planner.added')}</span>
                        {diff.added.map(nameOf).join(', ')}
                      </p>
                    )}
                    {diff.removed.length > 0 && (
                      <p>
                        <span className="text-red-300/80 mr-2">− {t('planner.removed')}</span>
                        {diff.removed.map(nameOf).join(', ')}
                      </p>
                    )}
                    {diff.moved.length > 0 && (
                      <p>
                        <span className="text-mist mr-2">↔ {t('planner.moved')}</span>
                        {diff.moved.map((m) => nameOf(m.site_id)).join(', ')}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* warnings */}
              {itinerary.warnings.length > 0 && (
                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-5">
                  <p className="text-xs text-amber-200/80 mb-2">{t('planner.warnings')}</p>
                  <ul className="text-xs text-mist space-y-1 list-disc list-inside">
                    {itinerary.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* days */}
              {itinerary.days.map((day) => (
                <div key={day.index} className="glass p-6">
                  <h3 className="text-xl mb-5 flex items-baseline gap-3">
                    {t('planner.day', { n: day.index + 1 })}
                    {day.date && (
                      <span className="text-xs font-sans text-mist">
                        {formatDate(day.date, dateLocale(lang))}
                      </span>
                    )}
                  </h3>
                  {day.stops.length === 0 ? (
                    <p className="text-sm text-mist">{t('planner.noStops')}</p>
                  ) : (
                    <ol className="relative border-l border-white/10 ml-2 pl-6 space-y-5">
                      <AnimatePresence initial={false}>
                        {day.stops.map((stop) => {
                          const fresh =
                            diff?.added.includes(stop.site_id) ||
                            diff?.moved.some((m) => m.site_id === stop.site_id)
                          return (
                            <motion.li
                              key={stop.site_id}
                              layout
                              initial={{ opacity: 0, x: -12 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 12 }}
                              transition={{ duration: 0.6, ease: EASE }}
                              className="relative"
                            >
                              <span
                                className={clsx(
                                  'absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full',
                                  fresh ? 'bg-gold shadow-glow' : 'bg-white/30',
                                )}
                              />
                              <p className="text-xs text-mist">
                                {formatTime(stop.start_min)} – {formatTime(stop.end_min)}
                                {stop.transit_min > 0 && (
                                  <span className="ml-3">
                                    · {t('card.min', { count: stop.transit_min })} {t('planner.transit')}
                                    {stop.transit_cost_jpy > 0 && ` · ${formatYen(stop.transit_cost_jpy)}`}
                                  </span>
                                )}
                              </p>
                              <button
                                type="button"
                                title={t('map.showOnMap')}
                                onClick={() => showOnMap(stop.site_id)}
                                className="text-left text-lg font-serif transition-colors duration-500 ease-calm hover:text-gold"
                              >
                                {nameOf(stop.site_id)}
                              </button>
                              <p className="text-xs text-mist">
                                {stop.entry_fee_jpy === 0 ? t('card.free') : formatYen(stop.entry_fee_jpy)}
                                <button
                                  type="button"
                                  onClick={() => setBestTimeSite(stop.site_id)}
                                  className="ml-4 text-gold/80 hover:text-gold hover:underline"
                                >
                                  {t('smart.dialog.open')}
                                </button>
                              </p>
                            </motion.li>
                          )
                        })}
                      </AnimatePresence>
                    </ol>
                  )}
                </div>
              ))}

              {/* stays */}
              <StaysSection itinerary={itinerary} startDate={itinerary.days[0]?.date ?? null} />
            </div>
          )}
        </section>
      </div>

      {bestTimeSite && (
        <BestTimeDialog siteId={bestTimeSite} name={nameOf(bestTimeSite)} onClose={() => setBestTimeSite(null)} />
      )}
    </div>
  )
}