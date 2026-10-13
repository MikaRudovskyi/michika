export type LngLat = [number, number] // GeoJSON order: longitude, latitude

/** A request to fly to a stop. `nonce` makes repeated clicks on the same stop work. */
export interface Focus {
  id: string
  nonce: number
}

export interface SegmentInfo {
  mode: string | null
  minutes: number
  costJpy: number // per person
}

export interface MapStop {
  id: string
  lngLat: LngLat
  day: number
  order: number // position within the day, starting at 1
  title: string
  lines: string[]
  inbound: SegmentInfo | null // how to get here from the previous stop of the same day
}

export interface MapStay {
  id: string
  lngLat: LngLat
  title: string
  lines: string[]
  recommended: boolean
}

export const DAY_COLORS = ['#D4AF37', '#7FB7A4', '#C9826B', '#8FA8D8', '#B79BD6', '#D9C27A', '#6FBF73']
export const dayColor = (day: number) => DAY_COLORS[day % DAY_COLORS.length]

// Plain `type` aliases (not interfaces) so they are assignable to GeoJSON typings.
export type SegmentProps = { color: string; day: number; mode: string; minutes: number; cost: number }
export type LineFeature = {
  type: 'Feature'
  properties: SegmentProps
  geometry: { type: 'LineString'; coordinates: LngLat[] }
}
export type LineCollection = { type: 'FeatureCollection'; features: LineFeature[] }

export const EMPTY_LINES: LineCollection = { type: 'FeatureCollection', features: [] }

const LINK_COLOR = '#9A968D'

/**
 * One line segment per hop inside a day (it carries the transport info),
 * plus dashed links between the last stop of one day and the first of the next.
 */
export function buildRoute(
  stops: MapStop[],
  visibleDay: number | null,
): { lines: LineCollection; links: LineCollection } {
  const byDay = new Map<number, MapStop[]>()
  for (const stop of stops) {
    const list = byDay.get(stop.day)
    if (list) list.push(stop)
    else byDay.set(stop.day, [stop])
  }

  const segments: LineFeature[] = []
  const links: LineFeature[] = []
  let previousLast: MapStop | null = null

  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    const seq = [...(byDay.get(day) ?? [])].sort((a, b) => a.order - b.order)
    if (seq.length === 0) continue

    if (visibleDay === null || visibleDay === day) {
      for (let i = 1; i < seq.length; i++) {
        const to = seq[i]
        segments.push({
          type: 'Feature',
          properties: {
            color: dayColor(day),
            day,
            mode: to.inbound?.mode ?? '',
            minutes: to.inbound?.minutes ?? 0,
            cost: to.inbound?.costJpy ?? 0,
          },
          geometry: { type: 'LineString', coordinates: [seq[i - 1].lngLat, to.lngLat] },
        })
      }
      if (visibleDay === null && previousLast) {
        links.push({
          type: 'Feature',
          properties: { color: LINK_COLOR, day: -1, mode: '', minutes: 0, cost: 0 },
          geometry: { type: 'LineString', coordinates: [previousLast.lngLat, seq[0].lngLat] },
        })
      }
    }
    previousLast = seq[seq.length - 1]
  }

  return {
    lines: { type: 'FeatureCollection', features: segments },
    links: { type: 'FeatureCollection', features: links },
  }
}

export function boundsOf(points: LngLat[]): [LngLat, LngLat] | null {
  if (points.length === 0) return null
  let minLon = Infinity
  let minLat = Infinity
  let maxLon = -Infinity
  let maxLat = -Infinity
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ]
}

export function haversineKm(a: LngLat, b: LngLat): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b[1] - a[1])
  const dLon = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export interface Area {
  lat: number
  lon: number
  radiusKm: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Circle around the route's centre that covers every stop with a 5 km margin (max 50 km, the API limit). */
export function nearbyArea(points: LngLat[]): Area | null {
  if (points.length === 0) return null
  const lon = points.reduce((sum, p) => sum + p[0], 0) / points.length
  const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length
  const reach = Math.max(...points.map((p) => haversineKm([lon, lat], p)))
  return {
    lat: round2(lat),
    lon: round2(lon),
    radiusKm: Math.min(50, Math.max(3, Math.ceil(reach + 5))),
  }
}