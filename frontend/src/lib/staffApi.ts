import { query, request } from './http'
import type { Booking, BookingStatus } from './types'
import type {
  AdminUser,
  City,
  I18nText,
  ItinerarySummary,
  LogEntry,
  Page,
  Region,
  Role,
  StaffAccommodation,
  StaffBooking,
  StaffItinerary,
  StaffSite,
  Stats,
} from './types.staff'

export const staffApi = {
  /* ------------------------------ overview ----------------------------- */
  stats() {
    return request<Stats>('/staff/stats')
  },

  /* ------------------------------ bookings ----------------------------- */
  bookings(status?: BookingStatus) {
    return request<Page<StaffBooking>>(`/staff/bookings${query({ status, limit: 100 })}`)
  },

  confirmBooking(id: string) {
    return request<Booking>(`/bookings/${id}/confirm`, { method: 'POST', json: {} })
  },

  completeBooking(id: string) {
    return request<Booking>(`/bookings/${id}/complete`, { method: 'POST', json: {} })
  },

  cancelBooking(id: string, note?: string) {
    return request<Booking>(`/bookings/${id}/cancel`, {
      method: 'POST',
      json: { note: note || null },
    })
  },

  /* ---------------------------- accommodations ------------------------- */
  accommodations() {
    return request<StaffAccommodation[]>('/accommodations/managed')
  },

  createAccommodation(data: object, ownerId?: string) {
    return request<StaffAccommodation>(`/accommodations${query({ owner_id: ownerId })}`, {
      method: 'POST',
      json: data,
    })
  },

  updateAccommodation(id: string, data: object) {
    return request<StaffAccommodation>(`/accommodations/${id}`, { method: 'PATCH', json: data })
  },

  deleteAccommodation(id: string) {
    return request<void>(`/accommodations/${id}`, { method: 'DELETE' })
  },

  setAccommodationOwner(id: string, ownerId: string) {
    return request<StaffAccommodation>(`/accommodations/${id}/owner`, {
      method: 'POST',
      json: { owner_id: ownerId },
    })
  },

  /* --------------------------- cultural sites -------------------------- */
  sites(p: { q?: string; availability?: string }) {
    return request<Page<StaffSite>>(`/sites/managed${query({ ...p, limit: 100 })}`)
  },

  createSite(data: object) {
    return request<StaffSite>('/sites', { method: 'POST', json: data })
  },

  updateSite(id: string, data: object) {
    return request<StaffSite>(`/sites/${id}`, { method: 'PATCH', json: data })
  },

  deleteSite(id: string, force: boolean) {
    return request<void>(`/sites/${id}${query({ force: force || undefined })}`, {
      method: 'DELETE',
    })
  },

  /* ------------------------------- routes ------------------------------ */
  itineraries(p: { skip?: number; limit?: number }) {
    return request<Page<ItinerarySummary>>(`/staff/itineraries${query(p)}`)
  },

  itinerary(id: string) {
    return request<StaffItinerary>(`/staff/itineraries/${id}`)
  },

  /* ------------------------- regions and cities ------------------------ */
  createRegion(body: { key: string; name: I18nText }) {
    return request<Region>('/regions', { method: 'POST', json: body })
  },

  renameRegion(key: string, name: I18nText) {
    return request<Region>(`/regions/${key}`, { method: 'PATCH', json: { name } })
  },

  deleteRegion(key: string) {
    return request<void>(`/regions/${key}`, { method: 'DELETE' })
  },

  createCity(body: { key: string; region_key: string; name: I18nText }) {
    return request<City>('/cities', { method: 'POST', json: body })
  },

  renameCity(key: string, name: I18nText) {
    return request<City>(`/cities/${key}`, { method: 'PATCH', json: { name } })
  },

  deleteCity(key: string) {
    return request<void>(`/cities/${key}`, { method: 'DELETE' })
  },

  /* -------------------------------- users ------------------------------ */
  users(p: { role?: string; status?: string; q?: string }) {
    return request<Page<AdminUser>>(`/admin/users${query({ ...p, limit: 100 })}`)
  },

  blockUser(id: string, reason?: string) {
    return request<AdminUser>(`/admin/users/${id}/block`, {
      method: 'POST',
      json: { reason: reason || null },
    })
  },

  unblockUser(id: string) {
    return request<AdminUser>(`/admin/users/${id}/unblock`, { method: 'POST', json: {} })
  },

  setRole(id: string, role: Exclude<Role, 'admin'>) {
    return request<AdminUser>(`/admin/users/${id}/role`, { method: 'POST', json: { role } })
  },

  createManager(body: { email: string; name: string; password: string }) {
    return request<AdminUser>('/admin/managers', { method: 'POST', json: body })
  },

  /* -------------------------------- logs ------------------------------- */
  logs(p: { action?: string; skip?: number; limit?: number }) {
    return request<Page<LogEntry>>(`/admin/logs${query(p)}`)
  },
}