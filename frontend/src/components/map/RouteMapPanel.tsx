import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLang } from '../../hooks/useLang'
import { api } from '../../lib/api'
import { formatTime, formatYen } from '../../lib/format'
import { mapApi } from '../../lib/mapApi'
import { dayColor, nearbyArea } from '../../lib/mapGeo'
import type { Area, Focus, MapStay, MapStop, SegmentProps } from '../../lib/mapGeo'
import type { Itinerary, SiteItem } from '../../lib/types'
import RouteMap from './RouteMap'

interface Props {
  itinerary: Itinerary
  sites: Map<string, SiteItem>
  startDate: string | null
  focus: Focus | null
}

export default function RouteMapPanel({ itinerary, sites, startDate, focus }: Props) {
  const { t } = useTranslation()
  const lang = useLang()
  const [day, setDay] = useState<number | null>(null)
  const [showStays, setShowStays] = useState(true)
  const [seenNonce, setSeenNonce] = useState<number | null>(null)

  const stops = useMemo<MapStop[]>(() => {
    const out: MapStop[] = []
    for (const d of itinerary.days) {
      d.stops.forEach((stop, i) => {
        const site = sites.get(stop.site_id)
        if (!site) return
        out.push({
          id: stop.site_id,
          lngLat: site.location.coordinates,
          day: d.index,
          order: i + 1,
          title: site.name,
          lines: [
            `${t('planner.day', { n: d.index + 1 })} · ${formatTime(stop.start_min)} – ${formatTime(stop.end_min)}`,
            stop.entry_fee_jpy === 0 ? t('card.free') : formatYen(stop.entry_fee_jpy),
          ],
          inbound:
            i > 0
              ? { mode: stop.transit_mode, minutes: stop.transit_min, costJpy: stop.transit_cost_jpy }
              : null,
        })
      })
    }
    return out
  }, [itinerary, sites, t])

  // A stop picked in the timeline must be visible: drop the day filter if it hides that stop.
  if (focus && focus.nonce !== seenNonce) {
    setSeenNonce(focus.nonce)
    const target = stops.find((s) => s.id === focus.id)
    if (target && day !== null && target.day !== day) setDay(null)
  }

  const days = itinerary.days.filter((d) => d.stops.length > 0)
  const activeDay = day !== null && days.some((d) => d.index === day) ? day : null

  // Properties around the route (public endpoint).
  const area = useMemo(() => nearbyArea(stops.map((s) => s.lngLat)), [stops])
  const nearby = useQuery({
    queryKey: ['stays-near', lang, area?.lat, area?.lon, area?.radiusKm],
    queryFn: () => mapApi.stayNear(area as Area, lang),
    enabled: !!area && showStays,
  })

  // Same key and function as the "Where to stay" section, so the request is shared.
  const recommendations = useQuery({
    queryKey: ['stays', itinerary.id, itinerary.version, startDate, lang],
    queryFn: () => api.recommendStays(itinerary.id as string, startDate as string, lang),
    enabled: !!itinerary.id && !!startDate && itinerary.days.length > 1,
  })

  // accommodation id -> true when it is the top pick of some stretch of the route
  const recommended = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const rec of recommendations.data?.stays ?? []) {
      rec.options.forEach((option, i) => {
        map.set(option.accommodation_id, (map.get(option.accommodation_id) ?? false) || i === 0)
      })
    }
    return map
  }, [recommendations.data])

  const stays = useMemo<MapStay[]>(
    () =>
      (nearby.data?.items ?? []).map((a) => {
        const isRecommended = recommended.has(a.id)
        return {
          id: a.id,
          lngLat: a.location.coordinates,
          title: a.name,
          lines: [
            `${t(`stays.type.${a.type}`, { defaultValue: a.type })} · ★ ${a.rating.toFixed(1)}`,
            t('map.fromPrice', { price: formatYen(a.from_price_jpy) }),
            ...(isRecommended ? [recommended.get(a.id) ? t('stays.bestMatch') : t('map.recommendedStay')] : []),
          ],
          recommended: isRecommended,
        }
      }),
    [nearby.data, recommended, t],
  )

  const describeSegment = useCallback(
    (p: SegmentProps) => ({
      title: t(`map.mode.${p.mode}`, { defaultValue: p.mode || '' }),
      lines: [
        t('card.min', { count: p.minutes }),
        p.cost > 0 ? `${formatYen(p.cost)} ${t('planner.perPerson')}` : t('card.free'),
      ],
    }),
    [t],
  )

  return (
    <section id="route-map" className="glass overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-5 border-b border-white/10">
        <h2 className="text-xl mr-3">{t('map.title')}</h2>

        <button className={clsx('chip', activeDay === null && 'chip-active')} onClick={() => setDay(null)}>
          {t('map.allDays')}
        </button>
        {days.map((d) => (
          <button
            key={d.index}
            className={clsx('chip inline-flex items-center gap-2', activeDay === d.index && 'chip-active')}
            onClick={() => setDay(d.index)}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dayColor(d.index) }} />
            {t('planner.day', { n: d.index + 1 })}
          </button>
        ))}

        <label className="ml-auto flex items-center gap-2 text-xs text-mist cursor-pointer">
          <input
            type="checkbox"
            className="accent-gold h-4 w-4"
            checked={showStays}
            onChange={(e) => setShowStays(e.target.checked)}
          />
          {t('map.showStays')}
        </label>
      </div>

      <RouteMap
        className="h-[440px] w-full"
        stops={stops}
        stays={stays}
        visibleDay={activeDay}
        showStays={showStays}
        focus={focus}
        describeSegment={describeSegment}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 border-t border-white/10 text-[11px] text-mist">
        <span>{t('map.hint')}</span>
        {showStays && (
          <>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rotate-45 bg-gold" />
              {t('map.legendRecommended')}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rotate-45 border border-washi/70" />
              {t('map.legendNearby')}
            </span>
          </>
        )}
      </div>
    </section>
  )
}