import { useState } from 'react'
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import type { CancellationTier } from '../../lib/types'
import type {
  AccommodationKind,
  AccommodationPayload,
  City,
  Region,
  StaffAccommodation,
} from '../../lib/types.staff'
import Modal from './Modal'

const KINDS: { value: AccommodationKind; label: string }[] = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'ryokan', label: 'Ryokan' },
  { value: 'machiya', label: 'Machiya' },
  { value: 'hostel', label: 'Hostel' },
]
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DEFAULT_TIERS: CancellationTier[] = [
  { days_before: 7, refund_pct: 100 },
  { days_before: 3, refund_pct: 50 },
  { days_before: 0, refund_pct: 0 },
]

let counter = 0
const nextUid = () => ++counter

interface RoomDraft {
  uid: number
  id: string
  isNew: boolean
  nameEn: string
  nameUk: string
  nameJa: string
  capacity: string
  price: string
  count: string
}
interface SeasonDraft {
  uid: number
  label: string
  from: string
  to: string
  multiplier: string
}
interface TierDraft {
  uid: number
  days: string
  pct: string
}
interface Draft {
  type: AccommodationKind
  nameEn: string
  nameUk: string
  nameJa: string
  descEn: string
  descUk: string
  descJa: string
  regionId: string
  cityId: string
  lat: string
  lon: string
  rating: string
  weekend: string
  status: 'active' | 'hidden'
  amenities: string
  ownerId: string
}

const blankRoom = (id: string): RoomDraft => ({
  uid: nextUid(),
  id,
  isNew: true,
  nameEn: '',
  nameUk: '',
  nameJa: '',
  capacity: '2',
  price: '',
  count: '1',
})

const toDraft = (a: StaffAccommodation | null, ownerId: string): Draft => ({
  type: a?.type ?? 'hotel',
  nameEn: a?.name.en ?? '',
  nameUk: a?.name.uk ?? '',
  nameJa: a?.name.ja ?? '',
  descEn: a?.description?.en ?? '',
  descUk: a?.description?.uk ?? '',
  descJa: a?.description?.ja ?? '',
  regionId: a?.region_id ?? '',
  cityId: a?.city_id ?? '',
  lat: a ? String(a.location.coordinates[1]) : '',
  lon: a ? String(a.location.coordinates[0]) : '',
  rating: String(a?.rating ?? 4),
  weekend: String(a?.weekend_multiplier ?? 1),
  status: a?.status ?? 'active',
  amenities: (a?.amenities ?? []).join(', '),
  ownerId,
})

const toRooms = (a: StaffAccommodation | null): RoomDraft[] =>
  a
    ? a.rooms.map((r) => ({
        uid: nextUid(),
        id: r.id,
        isNew: false,
        nameEn: r.name.en,
        nameUk: r.name.uk ?? '',
        nameJa: r.name.ja ?? '',
        capacity: String(r.capacity),
        price: String(r.base_price_jpy),
        count: String(r.count),
      }))
    : [blankRoom('standard')]

const toSeasons = (a: StaffAccommodation | null): SeasonDraft[] =>
  (a?.seasons ?? []).map((s) => ({
    uid: nextUid(),
    label: s.label,
    from: s.date_from,
    to: s.date_to,
    multiplier: String(s.multiplier),
  }))

const toTiers = (a: StaffAccommodation | null): TierDraft[] =>
  (a?.cancellation_policy ?? DEFAULT_TIERS).map((t) => ({
    uid: nextUid(),
    days: String(t.days_before),
    pct: String(t.refund_pct),
  }))

function validate(d: Draft, rooms: RoomDraft[], seasons: SeasonDraft[], tiers: TierDraft[]): string | null {
  if (!d.nameEn.trim()) return 'The English name is required.'
  if (!d.regionId || !d.cityId) return 'Choose a region and a city.'
  const lat = Number(d.lat)
  const lon = Number(d.lon)
  if (!d.lat.trim() || !d.lon.trim() || !Number.isFinite(lat) || !Number.isFinite(lon))
    return 'Latitude and longitude must be numbers.'
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return 'Coordinates are out of range.'
  const rating = Number(d.rating)
  if (!(rating >= 0 && rating <= 5)) return 'Rating must be between 0 and 5.'
  const weekend = Number(d.weekend)
  if (!(weekend >= 0.5 && weekend <= 3)) return 'The weekend multiplier must be between 0.5 and 3.'

  if (rooms.length === 0) return 'Add at least one room type.'
  const ids = new Set<string>()
  for (const [i, r] of rooms.entries()) {
    const n = i + 1
    if (!ID.test(r.id) || r.id.length > 40)
      return `Room ${n}: the id may contain lowercase letters, digits and hyphens (max 40).`
    if (ids.has(r.id)) return `Room ${n}: the id "${r.id}" is used twice.`
    ids.add(r.id)
    if (!r.nameEn.trim()) return `Room ${n}: the English name is required.`
    const capacity = Number(r.capacity)
    const price = Number(r.price)
    const count = Number(r.count)
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10) return `Room ${n}: capacity must be 1 to 10.`
    if (!Number.isInteger(price) || price <= 0) return `Room ${n}: the base price must be a positive whole number.`
    if (!Number.isInteger(count) || count < 1 || count > 500) return `Room ${n}: the room count must be 1 to 500.`
  }

  for (const [i, s] of seasons.entries()) {
    const n = i + 1
    if (!s.label.trim()) return `Season ${n}: add a label.`
    if (!s.from || !s.to) return `Season ${n}: choose both dates.`
    if (s.to < s.from) return `Season ${n}: the end date is before the start date.`
    const m = Number(s.multiplier)
    if (!(m > 0 && m <= 5)) return `Season ${n}: the multiplier must be above 0 and at most 5.`
  }

  const days = new Set<number>()
  for (const [i, t] of tiers.entries()) {
    const n = i + 1
    const day = Number(t.days)
    const pct = Number(t.pct)
    if (!Number.isInteger(day) || day < 0) return `Policy tier ${n}: days must be a whole number, 0 or more.`
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return `Policy tier ${n}: the refund must be 0 to 100%.`
    if (days.has(day)) return `Policy tier ${n}: another tier already uses ${day} days.`
    days.add(day)
  }
  return null
}

function toPayload(d: Draft, rooms: RoomDraft[], seasons: SeasonDraft[], tiers: TierDraft[]): AccommodationPayload {
  const hasDescription = d.descEn.trim() || d.descUk.trim() || d.descJa.trim()
  return {
    name: { en: d.nameEn.trim(), uk: d.nameUk.trim() || null, ja: d.nameJa.trim() || null },
    description: hasDescription
      ? { en: d.descEn.trim(), uk: d.descUk.trim() || null, ja: d.descJa.trim() || null }
      : null,
    type: d.type,
    region_id: d.regionId,
    city_id: d.cityId,
    location: { type: 'Point', coordinates: [Number(d.lon), Number(d.lat)] },
    rooms: rooms.map((r) => ({
      id: r.id,
      name: { en: r.nameEn.trim(), uk: r.nameUk.trim() || null, ja: r.nameJa.trim() || null },
      capacity: Number(r.capacity),
      base_price_jpy: Number(r.price),
      count: Number(r.count),
    })),
    weekend_multiplier: Number(d.weekend),
    seasons: seasons.map((s) => ({
      label: s.label.trim(),
      date_from: s.from,
      date_to: s.to,
      multiplier: Number(s.multiplier),
    })),
    amenities: d.amenities
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
    cancellation_policy: tiers
      .map((t) => ({ days_before: Number(t.days), refund_pct: Number(t.pct) }))
      .sort((a, b) => b.days_before - a.days_before),
    rating: Number(d.rating),
    status: d.status,
  }
}

const update = <T extends { uid: number }>(set: Dispatch<SetStateAction<T[]>>, uid: number, patch: Partial<T>) =>
  set((rows) => rows.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))

const remove = <T extends { uid: number }>(set: Dispatch<SetStateAction<T[]>>, uid: number) =>
  set((rows) => rows.filter((r) => r.uid !== uid))

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs text-mist mb-2">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-mist/70 mt-1">{hint}</span>}
    </label>
  )
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4 border-b border-white/10 pb-2">
        <div>
          <h3 className="text-lg">{title}</h3>
          {hint && <p className="text-[11px] text-mist mt-1">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

interface Props {
  acc: StaffAccommodation | null // null = create
  regions: Region[]
  cities: City[]
  owners: { id: string; label: string }[] | null // admin only; null hides the owner field
  defaultOwnerId: string
  pending: boolean
  error: string | null
  onSubmit: (data: AccommodationPayload, ownerId: string) => void
  onClose: () => void
}

export default function AccommodationForm({
  acc,
  regions,
  cities,
  owners,
  defaultOwnerId,
  pending,
  error,
  onSubmit,
  onClose,
}: Props) {
  const isCreate = acc === null
  const [d, setD] = useState<Draft>(() => toDraft(acc, defaultOwnerId))
  const [rooms, setRooms] = useState<RoomDraft[]>(() => toRooms(acc))
  const [seasons, setSeasons] = useState<SeasonDraft[]>(() => toSeasons(acc))
  const [tiers, setTiers] = useState<TierDraft[]>(() => toTiers(acc))
  const [localError, setLocalError] = useState<string | null>(null)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }))
  const cityOptions = cities.filter((c) => c.region_key === d.regionId)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const problem = validate(d, rooms, seasons, tiers)
    setLocalError(problem)
    if (problem) return
    onSubmit(toPayload(d, rooms, seasons, tiers), d.ownerId)
  }

  return (
    <Modal title={isCreate ? 'New property' : `Edit ${acc.name.en}`} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-8">
        <Section title="Basics">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type">
              <select className="input" value={d.type} onChange={(e) => set('type', e.target.value as AccommodationKind)}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value} className="bg-charcoal">
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Visibility">
              <select className="input" value={d.status} onChange={(e) => set('status', e.target.value as 'active' | 'hidden')}>
                <option value="active" className="bg-charcoal">Active (bookable)</option>
                <option value="hidden" className="bg-charcoal">Hidden</option>
              </select>
            </Field>
            <Field label="Rating (0–5)">
              <input className="input" inputMode="decimal" value={d.rating} onChange={(e) => set('rating', e.target.value)} />
            </Field>
          </div>

          {owners && (
            <Field label="Owner" hint={isCreate ? 'The manager who handles bookings for this property.' : 'Use "Reassign owner" in the list to change it.'}>
              <select className="input" value={d.ownerId} disabled={!isCreate} onChange={(e) => set('ownerId', e.target.value)}>
                {owners.map((o) => (
                  <option key={o.id} value={o.id} className="bg-charcoal">
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name (English)">
              <input className="input" value={d.nameEn} onChange={(e) => set('nameEn', e.target.value)} />
            </Field>
            <Field label="Name (Ukrainian)">
              <input className="input" value={d.nameUk} onChange={(e) => set('nameUk', e.target.value)} />
            </Field>
            <Field label="Name (Japanese)">
              <input className="input" value={d.nameJa} onChange={(e) => set('nameJa', e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Description (English)">
              <textarea className="input" rows={3} value={d.descEn} onChange={(e) => set('descEn', e.target.value)} />
            </Field>
            <Field label="Description (Ukrainian)">
              <textarea className="input" rows={3} value={d.descUk} onChange={(e) => set('descUk', e.target.value)} />
            </Field>
            <Field label="Description (Japanese)">
              <textarea className="input" rows={3} value={d.descJa} onChange={(e) => set('descJa', e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Region">
              <select
                className="input"
                value={d.regionId}
                onChange={(e) => setD((prev) => ({ ...prev, regionId: e.target.value, cityId: '' }))}
              >
                <option value="" className="bg-charcoal">Choose…</option>
                {regions.map((r) => (
                  <option key={r.key} value={r.key} className="bg-charcoal">
                    {r.name.en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <select className="input" value={d.cityId} onChange={(e) => set('cityId', e.target.value)}>
                <option value="" className="bg-charcoal">Choose…</option>
                {cityOptions.map((c) => (
                  <option key={c.key} value={c.key} className="bg-charcoal">
                    {c.name.en}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Latitude">
              <input className="input" inputMode="decimal" value={d.lat} onChange={(e) => set('lat', e.target.value)} placeholder="35.0036" />
            </Field>
            <Field label="Longitude">
              <input className="input" inputMode="decimal" value={d.lon} onChange={(e) => set('lon', e.target.value)} placeholder="135.7740" />
            </Field>
          </div>

          <Field label="Amenities" hint="Comma-separated, e.g. wifi, breakfast, onsen">
            <input className="input" value={d.amenities} onChange={(e) => set('amenities', e.target.value)} />
          </Field>
        </Section>

        <Section
          title="Rooms"
          hint="Existing room ids are locked because bookings refer to them. Room types with active bookings cannot be removed."
          action={
            <button
              type="button"
              className="btn btn-ghost !py-1.5 !px-4 text-xs"
              onClick={() => setRooms((rs) => [...rs, blankRoom(`room-${rs.length + 1}`)])}
            >
              Add room type
            </button>
          }
        >
          {rooms.map((r) => (
            <div key={r.uid} className="rounded-xl border border-white/10 p-4 flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Id">
                  <input className="input" value={r.id} disabled={!r.isNew} onChange={(e) => update(setRooms, r.uid, { id: e.target.value })} />
                </Field>
                <Field label="Guests per room">
                  <input className="input" type="number" min={1} max={10} value={r.capacity} onChange={(e) => update(setRooms, r.uid, { capacity: e.target.value })} />
                </Field>
                <Field label="Base price per night (¥)">
                  <input className="input" type="number" min={1} value={r.price} onChange={(e) => update(setRooms, r.uid, { price: e.target.value })} />
                </Field>
                <Field label="Rooms of this type">
                  <input className="input" type="number" min={1} max={500} value={r.count} onChange={(e) => update(setRooms, r.uid, { count: e.target.value })} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Name (English)">
                  <input className="input" value={r.nameEn} onChange={(e) => update(setRooms, r.uid, { nameEn: e.target.value })} />
                </Field>
                <Field label="Name (Ukrainian)">
                  <input className="input" value={r.nameUk} onChange={(e) => update(setRooms, r.uid, { nameUk: e.target.value })} />
                </Field>
                <Field label="Name (Japanese)">
                  <input className="input" value={r.nameJa} onChange={(e) => update(setRooms, r.uid, { nameJa: e.target.value })} />
                </Field>
              </div>
              {rooms.length > 1 && (
                <div className="flex justify-end">
                  <button type="button" className="text-xs text-red-300/80 hover:underline" onClick={() => remove(setRooms, r.uid)}>
                    Remove room type
                  </button>
                </div>
              )}
            </div>
          ))}
        </Section>

        <Section
          title="Pricing rules"
          hint="Seasons multiply the base price for every night in the range (the highest matching one wins). Weekend nights are Friday and Saturday."
          action={
            <button
              type="button"
              className="btn btn-ghost !py-1.5 !px-4 text-xs"
              onClick={() => setSeasons((ss) => [...ss, { uid: nextUid(), label: '', from: '', to: '', multiplier: '1.3' }])}
            >
              Add season
            </button>
          }
        >
          <div className="max-w-xs">
            <Field label="Weekend multiplier (0.5–3)">
              <input className="input" inputMode="decimal" value={d.weekend} onChange={(e) => set('weekend', e.target.value)} />
            </Field>
          </div>
          {seasons.length === 0 && <p className="text-xs text-mist">No seasonal pricing.</p>}
          {seasons.map((s) => (
            <div key={s.uid} className="grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_0.8fr_auto] items-end">
              <Field label="Label">
                <input className="input" value={s.label} onChange={(e) => update(setSeasons, s.uid, { label: e.target.value })} placeholder="Autumn leaves" />
              </Field>
              <Field label="From">
                <input className="input [color-scheme:dark]" type="date" value={s.from} onChange={(e) => update(setSeasons, s.uid, { from: e.target.value })} />
              </Field>
              <Field label="To">
                <input className="input [color-scheme:dark]" type="date" value={s.to} onChange={(e) => update(setSeasons, s.uid, { to: e.target.value })} />
              </Field>
              <Field label="Multiplier">
                <input className="input" inputMode="decimal" value={s.multiplier} onChange={(e) => update(setSeasons, s.uid, { multiplier: e.target.value })} />
              </Field>
              <button type="button" className="text-xs text-red-300/80 hover:underline pb-3" onClick={() => remove(setSeasons, s.uid)}>
                Remove
              </button>
            </div>
          ))}
        </Section>

        <Section
          title="Cancellation policy"
          hint="A guest who cancels at least N days before check-in gets that refund. The tier with the most days that still applies wins; with no tier, nothing is refunded."
          action={
            <button
              type="button"
              className="btn btn-ghost !py-1.5 !px-4 text-xs"
              onClick={() => setTiers((ts) => [...ts, { uid: nextUid(), days: '', pct: '' }])}
            >
              Add tier
            </button>
          }
        >
          {tiers.length === 0 && <p className="text-xs text-mist">No refunds are given on cancellation.</p>}
          {tiers.map((t) => (
            <div key={t.uid} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
              <Field label="Days before check-in (at least)">
                <input className="input" type="number" min={0} value={t.days} onChange={(e) => update(setTiers, t.uid, { days: e.target.value })} />
              </Field>
              <Field label="Refund (%)">
                <input className="input" type="number" min={0} max={100} value={t.pct} onChange={(e) => update(setTiers, t.uid, { pct: e.target.value })} />
              </Field>
              <button type="button" className="text-xs text-red-300/80 hover:underline pb-3" onClick={() => remove(setTiers, t.uid)}>
                Remove
              </button>
            </div>
          ))}
        </Section>

        {(localError || error) && <p className="text-sm text-red-300/80">{localError ?? error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Back
          </button>
          <button className="btn btn-primary" disabled={pending}>
            {pending ? 'Saving…' : isCreate ? 'Create property' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}