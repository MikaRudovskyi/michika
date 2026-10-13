import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import logo from '../assets/michika-bg-1000.png'
import { useLang } from '../hooks/useLang'
import { api } from '../lib/api'
import { dateLocale, formatDate, formatYen } from '../lib/format'
import { mediaApi } from '../lib/mediaApi'
import { rise, stagger } from '../lib/motion'
import type { Itinerary, StayOption, StaySegment } from '../lib/types'
import BookingDialog from './BookingDialog'
import PropertyDialog from './PropertyDialog'
import ResponsiveImage from './ResponsiveImage'

interface Props {
  itinerary: Itinerary
  startDate: string | null
}

type Choice = { option: StayOption; segment: StaySegment }

export default function StaysSection({ itinerary, startDate }: Props) {
  const { t } = useTranslation()
  const lang = useLang()
  const locale = dateLocale(lang)
  const [selected, setSelected] = useState<Choice | null>(null) // booking
  const [viewing, setViewing] = useState<Choice | null>(null) // photos and surroundings

  const itineraryId = itinerary.id
  const needsStay = itinerary.days.length > 1

  const stays = useQuery({
    queryKey: ['stays', itineraryId, itinerary.version, startDate, lang],
    queryFn: () => api.recommendStays(itineraryId as string, startDate as string, lang),
    enabled: !!itineraryId && !!startDate && needsStay,
  })

  // Cover photos of every recommended property, in one request.
  const propertyIds = useMemo(
    () => [...new Set((stays.data?.stays ?? []).flatMap((r) => r.options.map((o) => o.accommodation_id)))],
    [stays.data],
  )
  const covers = useQuery({
    queryKey: ['covers', 'accommodation', propertyIds.join(',')],
    queryFn: () => mediaApi.covers('accommodation', propertyIds),
    enabled: propertyIds.length > 0,
  })

  if (!needsStay) return null

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="text-3xl">{t('stays.title')}</h2>
        <p className="text-sm text-mist mt-1">{t('stays.subtitle')}</p>
      </div>

      {!startDate && (
        <div className="glass p-6 text-sm text-mist">{t('stays.pickDate')}</div>
      )}

      {startDate && stays.isLoading && <p className="text-sm text-mist">{t('stays.loading')}</p>}
      {stays.isError && <p className="text-sm text-red-300/80">{(stays.error as Error).message}</p>}

      {stays.data && (
        <>
          <div className="glass p-6 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="text-xs text-mist mb-1">{t('stays.updatedCost')}</p>
              <p className="font-serif text-3xl text-gold">
                {formatYen(stays.data.cost_with_best_stays.total_jpy)}
              </p>
            </div>
            <p className="text-xs text-mist">
              {t('planner.lodging')}: {formatYen(stays.data.cost_with_best_stays.lodging_jpy)}
            </p>
          </div>

          {stays.data.warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-5">
              <ul className="text-xs text-mist space-y-1 list-disc list-inside">
                {stays.data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {stays.data.stays.map((rec) => (
            <div key={`${rec.segment.first_night}-${rec.segment.check_in}`}>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
                <h3 className="text-xl">{t('stays.nights', { count: rec.segment.nights })}</h3>
                <p className="text-xs text-mist">
                  {formatDate(rec.segment.check_in, locale)} → {formatDate(rec.segment.check_out, locale)}
                </p>
              </div>

              {rec.options.length === 0 ? (
                <p className="text-sm text-mist">{t('stays.noOptions')}</p>
              ) : (
                <motion.div
                  variants={stagger}
                  initial="hidden"
                  animate="show"
                  className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                >
                  {rec.options.map((o, i) => {
                    const cover = covers.data?.[o.accommodation_id]?.cover
                    const choice: Choice = { option: o, segment: rec.segment }
                    return (
                      <motion.article
                        key={`${o.accommodation_id}-${o.room_type_id}`}
                        variants={rise}
                        className={clsx('glass flex flex-col overflow-hidden', i === 0 && 'border-gold/40')}
                      >
                        <button
                          type="button"
                          aria-label={o.name}
                          onClick={() => setViewing(choice)}
                          className="group relative block h-36 w-full overflow-hidden bg-charcoal"
                        >
                          {cover ? (
                            <ResponsiveImage
                              image={cover}
                              sizes="(min-width: 1280px) 380px, (min-width: 768px) 45vw, 92vw"
                              fallbackAlt={o.name}
                              className="h-full w-full transition-transform duration-[1200ms] ease-calm group-hover:scale-105"
                            />
                          ) : (
                            <span className="grid h-full w-full place-items-center">
                              <img src={logo} alt="" className="h-24 select-none opacity-15" draggable={false} />
                            </span>
                          )}
                        </button>

                        <div className="flex flex-1 flex-col gap-3 p-5">
                          <div className="flex items-center justify-between">
                            <span className="eyebrow !tracking-[0.2em]">
                              {t(`stays.type.${o.type}`, { defaultValue: o.type })}
                            </span>
                            {i === 0 && <span className="text-[11px] text-gold">{t('stays.bestMatch')}</span>}
                          </div>
                          <h4 className="text-xl font-serif leading-snug">{o.name}</h4>
                          <p className="text-xs text-mist">
                            {o.room_name} · {t('stays.rooms', { count: o.rooms })} ·{' '}
                            {t('stays.distance', { km: o.distance_km })}
                          </p>
                          <div className="mt-auto flex items-end justify-between pt-2">
                            <div>
                              <p className="text-[11px] text-mist">{t('stays.total')}</p>
                              <p className="font-serif text-2xl text-gold">{formatYen(o.total_jpy)}</p>
                            </div>
                            <button
                              className="btn btn-ghost !py-2 !px-5 text-xs"
                              onClick={() => setSelected(choice)}
                            >
                              {t('stays.book')}
                            </button>
                          </div>
                        </div>
                      </motion.article>
                    )
                  })}
                </motion.div>
              )}
            </div>
          ))}
        </>
      )}

      {viewing && (
        <PropertyDialog
          accommodationId={viewing.option.accommodation_id}
          name={viewing.option.name}
          onBook={() => {
            setSelected(viewing)
            setViewing(null)
          }}
          onClose={() => setViewing(null)}
        />
      )}

      <AnimatePresence>
        {selected && (
          <BookingDialog
            key={`${selected.option.accommodation_id}-${selected.segment.check_in}`}
            itinerary={itinerary}
            option={selected.option}
            segment={selected.segment}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}