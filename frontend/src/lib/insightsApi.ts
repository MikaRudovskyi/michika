import { query, request } from './http'
import type { Lang } from './types'

export interface MonthScore {
  month: number
  crowd: number
  comfort: number
  score: number
}
export interface HourScore {
  hour: number
  crowd: number
}
export interface BestTime {
  site_id: string
  name: string
  indoor: boolean
  months: MonthScore[]
  best_months: number[]
  best_hours: HourScore[]
  climate_source: 'archive' | 'fallback'
}

export interface StartOption {
  start: string
  end: string
  score: number
  crowd: number
  weather: number
  closures: number
  reasons: string[]
}
export interface StartDates {
  options: StartOption[]
  current_start: string | null
  current_score: number | null
  climate_source: 'archive' | 'fallback'
}

export interface IndoorAlt {
  id: string
  name: string
  distance_km: number
}
export interface DayWeather {
  day: number
  date: string
  source: 'forecast' | 'normals'
  temp_mean: number
  temp_max: number | null
  temp_min: number | null
  rain_chance: number
  code: number | null
  flags: string[]
  outdoor_stops: string[]
  alternatives: IndoorAlt[]
}

export interface ServiceAlert {
  operator: string
  railway: string
  status: string | null
  text_en: string | null
  text_ja: string | null
}
export interface Alerts {
  configured: boolean
  alerts: ServiceAlert[]
}

export interface RouteMetrics {
  id: string
  days: number
  stops: number
  travelers: number
  start_date: string | null
  version: number
  total_jpy: number
  per_person_jpy: number
  per_day_jpy: number
  budget_jpy: number
  budget_used_pct: number
  within_budget: boolean
  entry_fees_jpy: number
  transport_jpy: number
  lodging_jpy: number
  extras_jpy: number
  activity_min: number
  transit_min: number
  avg_crowd: number
  warnings: number
  site_ids: string[]
}
export interface Candidate extends RouteMetrics {
  updated_at: string
}
export interface Comparison {
  routes: RouteMetrics[]
  best: Record<string, string>
  shared_site_ids: string[]
  site_names: Record<string, string>
}

export const insightsApi = {
  bestTime(siteId: string, lang: Lang) {
    return request<BestTime>(`/insights/sites/${siteId}/best-time${query({ lang })}`)
  },

  startDates(itineraryId: string) {
    return request<StartDates>(`/insights/itineraries/${itineraryId}/start-dates`, {
      method: 'POST',
      json: { window_days: 90, top: 5 },
    })
  },

  weather(itineraryId: string, lang: Lang) {
    return request<DayWeather[]>(`/insights/itineraries/${itineraryId}/weather${query({ lang })}`)
  },

  alerts() {
    return request<Alerts>('/insights/alerts')
  },

  candidates() {
    return request<Candidate[]>('/compare/candidates')
  },

  compare(ids: string[], lang: Lang) {
    return request<Comparison>(`/compare${query({ lang })}`, { method: 'POST', json: { ids } })
  },

  snapshot(itineraryId: string) {
    return request<Candidate>(`/compare/snapshot/${itineraryId}`, { method: 'POST', json: {} })
  },
}