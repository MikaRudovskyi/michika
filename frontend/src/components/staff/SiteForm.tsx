import clsx from 'clsx'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { SiteType } from '../../lib/types'
import type { Availability, City, Region, SitePayload, StaffSite } from '../../lib/types.staff'
import Modal from './Modal'

const TYPES: { value: SiteType; label: string }[] = [
  { value: 'temple', label: 'Temple' },
  { value: 'castle', label: 'Castle' },
  { value: 'garden', label: 'Garden' },
  { value: 'museum', label: 'Museum' },
  { value: 'historical_site', label: 'Historical site' },
  { value: 'tea_ceremony', label: 'Tea ceremony' },
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface Draft {
  slug: string
  type: SiteType
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
  fee: string
  duration: string
  popularity: number
  open: string
  close: string
  closedDays: number[]
  indoor: boolean
  tags: string
  availability: Availability
  reason: string
}

const toDraft = (s: StaffSite | null): Draft => ({
  slug: s?.slug ?? '',
  type: s?.type ?? 'temple',
  nameEn: s?.name.en ?? '',
  nameUk: s?.name.uk ?? '',
  nameJa: s?.name.ja ?? '',
  descEn: s?.description?.en ?? '',
  descUk: s?.description?.uk ?? '',
  descJa: s?.description?.ja ?? '',
  regionId: s?.region_id ?? '',
  cityId: s?.city_id ?? '',
  lat: s ? String(s.location.coordinates[1]) : '',
  lon: s ? String(s.location.coordinates[0]) : '',
  fee: String(s?.fee_jpy ?? 0),
  duration: String(s?.avg_duration_min ?? 60),
  popularity: s?.popularity ?? 0.5,
  open: String(s?.open_hour ?? 9),
  close: String(s?.close_hour ?? 17),
  closedDays: s?.closed_weekdays ?? [],
  indoor: s?.indoor ?? false,
  tags: (s?.tags ?? []).join(', '),
  availability: s?.availability ?? 'available',
  reason: s?.unavailable_reason ?? '',
})

function validate(d: Draft, isCreate: boolean): string | null {
  if (isCreate && !SLUG.test(d.slug.trim())) return 'Slug: lowercase letters, digits and single hyphens only.'
  if (!d.nameEn.trim()) return 'The English name is required.'
  if (!d.regionId || !d.cityId) return 'Choose a region and a city.'
  const lat = Number(d.lat)
  const lon = Number(d.lon)
  if (!d.lat.trim() || !d.lon.trim() || !Number.isFinite(lat) || !Number.isFinite(lon))
    return 'Latitude and longitude must be numbers.'
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return 'Coordinates are out of range.'
  const open = Number(d.open)
  const close = Number(d.close)
  if (!(open >= 0 && open <= 23 && close >= 1 && close <= 24 && close > open))
    return 'Closing hour must be later than the opening hour (0–23 and 1–24).'
  return null
}

function toPayload(d: Draft): SitePayload {
  const hasDescription = d.descEn.trim() || d.descUk.trim() || d.descJa.trim()
  return {
    name: { en: d.nameEn.trim(), uk: d.nameUk.trim() || null, ja: d.nameJa.trim() || null },
    description: hasDescription
      ? { en: d.descEn.trim(), uk: d.descUk.trim() || null, ja: d.descJa.trim() || null }
      : null,
    type: d.type,
    tags: d.tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    region_id: d.regionId,
    city_id: d.cityId,
    location: { type: 'Point', coordinates: [Number(d.lon), Number(d.lat)] },
    fee_jpy: Math.round(Number(d.fee) || 0),
    avg_duration_min: Math.round(Number(d.duration) || 60),
    popularity: d.popularity,
    open_hour: Number(d.open),
    close_hour: Number(d.close),
    closed_weekdays: [...d.closedDays].sort(),
    indoor: d.indoor,
    availability: d.availability,
    unavailable_reason: d.availability === 'temporarily_unavailable' ? d.reason.trim() || null : null,
  }
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs text-mist mb-2">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-mist/70 mt-1">{hint}</span>}
    </label>
  )
}

interface Props {
  site: StaffSite | null // null = create
  regions: Region[]
  cities: City[]
  pending: boolean
  error: string | null
  onSubmit: (data: SitePayload & { slug?: string }) => void
  onClose: () => void
}

export default function SiteForm({ site, regions, cities, pending, error, onSubmit, onClose }: Props) {
  const isCreate = site === null
  const [d, setD] = useState<Draft>(() => toDraft(site))
  const [localError, setLocalError] = useState<string | null>(null)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }))
  const cityOptions = cities.filter((c) => c.region_key === d.regionId)

  const toggleDay = (day: number) =>
    set('closedDays', d.closedDays.includes(day) ? d.closedDays.filter((x) => x !== day) : [...d.closedDays, day])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const problem = validate(d, isCreate)
    setLocalError(problem)
    if (problem) return
    const payload = toPayload(d)
    onSubmit(isCreate ? { ...payload, slug: d.slug.trim() } : payload)
  }

  return (
    <Modal title={isCreate ? 'New cultural site' : `Edit ${site.name.en}`} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slug" hint={isCreate ? 'Used in URLs. Cannot be changed later.' : 'Cannot be changed.'}>
            <input
              className="input"
              value={d.slug}
              disabled={!isCreate}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="kinkaku-ji"
            />
          </Field>
          <Field label="Type">
            <select className="input" value={d.type} onChange={(e) => set('type', e.target.value as SiteType)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-charcoal">
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

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
              <option value="" className="bg-charcoal">
                Choose…
              </option>
              {regions.map((r) => (
                <option key={r.key} value={r.key} className="bg-charcoal">
                  {r.name.en}
                </option>
              ))}
            </select>
          </Field>
          <Field label="City">
            <select className="input" value={d.cityId} onChange={(e) => set('cityId', e.target.value)}>
              <option value="" className="bg-charcoal">
                Choose…
              </option>
              {cityOptions.map((c) => (
                <option key={c.key} value={c.key} className="bg-charcoal">
                  {c.name.en}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Latitude">
            <input className="input" inputMode="decimal" value={d.lat} onChange={(e) => set('lat', e.target.value)} placeholder="35.0394" />
          </Field>
          <Field label="Longitude">
            <input className="input" inputMode="decimal" value={d.lon} onChange={(e) => set('lon', e.target.value)} placeholder="135.7292" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Entry fee (¥)">
            <input className="input" type="number" min={0} value={d.fee} onChange={(e) => set('fee', e.target.value)} />
          </Field>
          <Field label="Typical visit (min)">
            <input className="input" type="number" min={10} max={600} value={d.duration} onChange={(e) => set('duration', e.target.value)} />
          </Field>
          <Field label="Opens (hour, 0–23)">
            <input className="input" type="number" min={0} max={23} value={d.open} onChange={(e) => set('open', e.target.value)} />
          </Field>
          <Field label="Closes (hour, 1–24)">
            <input className="input" type="number" min={1} max={24} value={d.close} onChange={(e) => set('close', e.target.value)} />
          </Field>
        </div>

        <Field label={`Popularity: ${d.popularity.toFixed(2)}`}>
          <input type="range" min={0} max={1} step={0.05} value={d.popularity} onChange={(e) => set('popularity', +e.target.value)} />
        </Field>

        <div>
          <p className="text-xs text-mist mb-2">Closed on</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((name, i) => (
              <button
                type="button"
                key={name}
                onClick={() => toggleDay(i)}
                className={clsx('chip', d.closedDays.includes(i) && 'chip-active')}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tags" hint="Comma-separated, e.g. zen, unesco">
            <input className="input" value={d.tags} onChange={(e) => set('tags', e.target.value)} />
          </Field>
          <label className="flex items-center gap-3 text-sm text-mist self-end pb-3">
            <input type="checkbox" className="accent-gold h-4 w-4" checked={d.indoor} onChange={(e) => set('indoor', e.target.checked)} />
            Indoor attraction (not affected by weather)
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Availability">
            <select
              className="input"
              value={d.availability}
              onChange={(e) => set('availability', e.target.value as Availability)}
            >
              <option value="available" className="bg-charcoal">
                Available
              </option>
              <option value="temporarily_unavailable" className="bg-charcoal">
                Temporarily unavailable
              </option>
            </select>
          </Field>
          {d.availability === 'temporarily_unavailable' && (
            <Field label="Reason (optional)">
              <input className="input" maxLength={300} value={d.reason} onChange={(e) => set('reason', e.target.value)} />
            </Field>
          )}
        </div>

        {(localError || error) && <p className="text-sm text-red-300/80">{localError ?? error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Back
          </button>
          <button className="btn btn-primary" disabled={pending}>
            {pending ? 'Saving…' : isCreate ? 'Create site' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}