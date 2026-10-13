import type { Booking, CancellationTier, Itinerary, SiteType } from './types'

export interface Page<T> {
  total: number
  items: T[]
}

export interface I18nText {
  en: string
  uk?: string | null
  ja?: string | null
}

export type Availability = 'available' | 'temporarily_unavailable'

/* ------------------------------- bookings ------------------------------ */

export interface StaffBooking extends Booking {
  guest_name: string | null
  guest_email: string | null
  note: string | null
}

/* ----------------------------- cultural sites -------------------------- */

export interface SitePayload {
  name: I18nText
  description: I18nText | null
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
  closed_weekdays: number[]
  indoor: boolean
  availability: Availability
  unavailable_reason: string | null
}

export interface StaffSite extends SitePayload {
  id: string
  slug: string
}

/* ------------------------------ accommodations ------------------------- */

export type AccommodationKind = 'hotel' | 'ryokan' | 'machiya' | 'hostel'

export interface RoomType {
  id: string
  name: I18nText
  capacity: number
  base_price_jpy: number
  count: number
}

export interface SeasonRule {
  label: string
  date_from: string
  date_to: string
  multiplier: number
}

export interface AccommodationPayload {
  name: I18nText
  description: I18nText | null
  type: AccommodationKind
  region_id: string
  city_id: string
  location: { type: 'Point'; coordinates: [number, number] }
  rooms: RoomType[]
  weekend_multiplier: number
  seasons: SeasonRule[]
  amenities: string[]
  cancellation_policy: CancellationTier[]
  rating: number
  status: 'active' | 'hidden'
}

export interface StaffAccommodation extends AccommodationPayload {
  id: string
  owner_id: string
  owner_email: string | null
  owner_name: string | null
}

/* ------------------------------ regions, users ------------------------- */

export interface Region {
  id: string
  key: string
  name: I18nText
}

export interface City {
  id: string
  key: string
  region_key: string
  name: I18nText
}

export type Role = 'user' | 'manager' | 'admin'

export interface AdminUser {
  id: string
  email: string
  name: string
  role: Role
  status: 'active' | 'blocked'
  created_at: string | null
}

export interface LogEntry {
  id: string
  at: string
  actor_id: string
  actor_email: string | null
  actor_role: string
  action: string
  target_type: string
  target_id: string
  meta: Record<string, unknown>
}

/* --------------------------- stats and routes -------------------------- */

export interface StatusStat {
  count: number
  value_jpy: number
}

export interface TopProperty {
  name: string
  bookings: number
  value_jpy: number
}

export interface AdminStats {
  users: number
  managers: number
  blocked: number
  sites: number
  sites_unavailable: number
  itineraries: number
  regions: number
  cities: number
}

export interface Stats {
  bookings: Record<string, StatusStat>
  upcoming_7d: number
  accommodations: number
  accommodations_hidden: number
  top_properties: TopProperty[]
  admin: AdminStats | null
}

export interface ItinerarySummary {
  id: string
  owner_id: string | null
  owner_name: string | null
  owner_email: string | null
  days: number
  stops: number
  travelers: number
  budget_jpy: number
  total_jpy: number
  start_date: string | null
  version: number
  warnings: number
  updated_at: string
}

export interface StaffItinerary extends Itinerary {
  owner_name: string | null
  owner_email: string | null
  site_names: Record<string, string>
}