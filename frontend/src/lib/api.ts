import { request } from './http'
import type {
  AccommodationDetail,
  Booking,
  BookingRequest,
  CancelPreview,
  Diff,
  Itinerary,
  Lang,
  PlanForm,
  Prefs,
  Quote,
  RecommendOut,
  SiteFilters,
  SitesResponse,
  User,
} from './types'
import type { City, Region } from './types.staff'

// Existing imports such as `import { ApiError, api, staffApi } from '../../lib/api'` keep working.
export { ApiError } from './http'
export { staffApi } from './staffApi'

// The form keeps '' for "no date"; the API expects null.
const planBody = (f: PlanForm) => ({ ...f, start_date: f.start_date || null })

export const api = {
  sites(filters: SiteFilters, lang: Lang) {
    const qs = new URLSearchParams({
      lang,
      sort: filters.sort,
      limit: String(filters.limit ?? 24),
    })
    if (filters.type) qs.set('type', filters.type)
    if (filters.maxFee !== undefined) qs.set('max_fee', String(filters.maxFee))
    if (filters.maxDuration !== undefined) qs.set('max_duration', String(filters.maxDuration))
    return request<SitesResponse>(`/sites?${qs}`)
  },

  regions() {
    return request<Region[]>('/regions')
  },

  cities() {
    return request<City[]>('/cities')
  },

  async login(email: string, password: string) {
    const form = new URLSearchParams({ username: email, password })
    return request<{ access_token: string }>('/auth/login', { method: 'POST', form })
  },

  register(input: { email: string; password: string; name: string; prefs: Prefs; locale: Lang }) {
    return request<User>('/auth/register', { method: 'POST', json: input })
  },

  me(token?: string) {
    return request<User>('/auth/me', { token })
  },

  generate(form: PlanForm) {
    return request<Itinerary>('/itineraries/generate?save=true', {
      method: 'POST',
      json: planBody(form),
    })
  },

  rebuild(id: string, form: PlanForm) {
    return request<{ itinerary: Itinerary; diff: Diff }>(`/itineraries/${id}/rebuild`, {
      method: 'PATCH',
      json: planBody(form),
    })
  },

  recommendStays(itineraryId: string, startDate: string, lang: Lang) {
    return request<RecommendOut>('/stays/recommend', {
      method: 'POST',
      json: { itinerary_id: itineraryId, start_date: startDate, lang, limit: 3 },
    })
  },

  accommodation(id: string, lang: Lang) {
    return request<AccommodationDetail>(`/accommodations/${id}?lang=${lang}`)
  },

  quote(p: {
    accommodationId: string
    roomTypeId: string
    checkIn: string
    checkOut: string
    guests: number
    rooms: number
  }) {
    const qs = new URLSearchParams({
      room_type_id: p.roomTypeId,
      check_in: p.checkIn,
      check_out: p.checkOut,
      guests: String(p.guests),
      rooms: String(p.rooms),
    })
    return request<Quote>(`/accommodations/${p.accommodationId}/quote?${qs}`)
  },

  createBooking(body: BookingRequest) {
    return request<Booking>('/bookings', { method: 'POST', json: body })
  },

  myBookings() {
    return request<Booking[]>('/bookings/mine')
  },

  cancellationPreview(id: string) {
    return request<CancelPreview>(`/bookings/${id}/cancellation-preview`)
  },

  cancelBooking(id: string) {
    return request<Booking>(`/bookings/${id}/cancel`, { method: 'POST', json: {} })
  },
}