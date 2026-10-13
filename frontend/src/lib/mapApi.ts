import { query, request } from './http'
import type { Area } from './mapGeo'
import type { Lang } from './types'

export interface NearbyStay {
  id: string
  name: string
  type: string
  location: { type: 'Point'; coordinates: [number, number] }
  from_price_jpy: number
  rating: number
}

export const mapApi = {
  /** Public endpoint: active properties inside the circle. */
  stayNear(area: Area, lang: Lang) {
    return request<{ total: number; items: NearbyStay[] }>(
      `/accommodations${query({
        lang,
        lat: area.lat,
        lon: area.lon,
        radius_km: area.radiusKm,
        limit: 100,
      })}`,
    )
  },
}