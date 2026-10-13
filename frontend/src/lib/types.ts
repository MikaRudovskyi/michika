export type Lang = 'en' | 'uk' | 'ja'
export type SiteType =
  | 'temple'
  | 'castle'
  | 'garden'
  | 'museum'
  | 'historical_site'
  | 'tea_ceremony'
export type SortKey = 'popularity' | 'fee' | 'duration'

export interface Prefs {
  interests: string[]
  budget_jpy: number
  trip_days: number
}

export interface User {
  id: string
  email: string
  name: string
  role: 'user' | 'manager' | 'admin'
  status: 'active' | 'blocked'
  prefs: Prefs
  locale: Lang
}

export interface SiteItem {
  id: string
  slug: string
  name: string
  description: string | null
  type: SiteType
  tags: string[]
  region_id: string
  city_id: string
  location: { type: 'Point'; coordinates: [number, number] }
  fee_jpy: number
  avg_duration_min: number
  popularity: number
  open_hour: number
  close_hour: number
}

export interface SitesResponse {
  total: number
  items: SiteItem[]
}

export interface Stop {
  site_id: string
  start_min: number
  end_min: number
  transit_min: number
  transit_mode: string | null
  transit_cost_jpy: number
  entry_fee_jpy: number
  crowd: number
}

export interface ItineraryDay {
  index: number
  date: string | null
  stops: Stop[]
  transfer_min: number
  transfer_cost_jpy: number
}

export interface CostBreakdown {
  entry_fees_jpy: number
  transport_jpy: number
  lodging_jpy: number
  extras_jpy: number
  total_jpy: number
  per_person_jpy: number
  low_jpy: number
  high_jpy: number
}

export interface ItineraryParamsOut {
  travelers: number
  budget_jpy: number
  days: number
  start_date: string | null
}

export interface Itinerary {
  id: string | null
  owner_id: string | null
  params: ItineraryParamsOut
  days: ItineraryDay[]
  cost: CostBreakdown
  warnings: string[]
  alternatives: string[]
  version: number
}

export interface Diff {
  added: string[]
  removed: string[]
  moved: { site_id: string; from_day: number; to_day: number }[]
}

export interface PlanForm {
  days: number
  budget_jpy: number
  travelers: number
  interests: string[]
  start_date: string // 'YYYY-MM-DD' or '' when not chosen
}

export interface SiteFilters {
  type?: SiteType
  maxFee?: number
  maxDuration?: number
  sort: SortKey
  limit?: number
}

/* ------------------------------ stays ------------------------------ */

export interface StaySegment {
  first_night: number
  nights: number
  check_in: string
  check_out: string
  anchor: [number, number]
}

export interface StayOption {
  accommodation_id: string
  room_type_id: string
  name: string
  room_name: string
  type: string
  distance_km: number
  rooms: number
  nightly_total_jpy: number[]
  total_jpy: number
  free_rooms: number
  score: number
}

export interface StayRecommendation {
  segment: StaySegment
  options: StayOption[]
}

export interface RecommendOut {
  start_date: string
  stays: StayRecommendation[]
  cost_with_best_stays: CostBreakdown
  warnings: string[]
}

export interface Quote {
  nights: number
  rooms: number
  nightly_total_jpy: number[]
  total_jpy: number
  free_rooms: number
  available: boolean
}

export interface CancellationTier {
  days_before: number
  refund_pct: number
}

export interface AccommodationDetail {
  id: string
  name: string
  description: string | null
  type: string
  amenities: string[]
  rating: number
  cancellation_policy: CancellationTier[]
}

/* ----------------------------- bookings ---------------------------- */

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'

export interface BookingRequest {
  accommodation_id: string
  room_type_id: string
  check_in: string
  check_out: string
  guests: number
  rooms: number
  itinerary_id: string | null
  note?: string
}

export interface Booking {
  id: string
  accommodation_id: string
  accommodation_name: string
  room_name: string
  check_in: string
  check_out: string
  guests: number
  rooms: number
  nightly_prices_jpy: number[]
  total_jpy: number
  policy: CancellationTier[]
  status: BookingStatus
  refund_jpy: number | null
  created_at: string
}

export interface CancelPreview {
  refund_pct: number
  refund_jpy: number
  days_until_check_in: number
}