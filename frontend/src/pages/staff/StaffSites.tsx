import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useDeferredValue, useState } from 'react'
import ConfirmDialog from '../../components/staff/ConfirmDialog'
import SiteForm from '../../components/staff/SiteForm'
import { ApiError, api, staffApi } from '../../lib/api'
import { formatYen } from '../../lib/format'
import type { Availability, StaffSite } from '../../lib/types.staff'
import { useAuth } from '../../store/auth'

const TYPE_LABEL: Record<string, string> = {
  temple: 'Temple',
  castle: 'Castle',
  garden: 'Garden',
  museum: 'Museum',
  historical_site: 'Historical site',
  tea_ceremony: 'Tea ceremony',
}

type Editing = StaffSite | 'new' | null

export default function StaffSites() {
  const qc = useQueryClient()
  const isAdmin = useAuth((s) => s.user?.role === 'admin')

  const [search, setSearch] = useState('')
  const q = useDeferredValue(search)
  const [availability, setAvailability] = useState<'' | Availability>('')
  const [editing, setEditing] = useState<Editing>(null)
  const [pausing, setPausing] = useState<StaffSite | null>(null)
  const [deleting, setDeleting] = useState<StaffSite | null>(null)
  const [force, setForce] = useState(false)

  const sites = useQuery({
    queryKey: ['staff', 'sites', q, availability],
    queryFn: () => staffApi.sites({ q: q.trim() || undefined, availability: availability || undefined }),
  })
  const regions = useQuery({ queryKey: ['regions'], queryFn: api.regions })
  const cities = useQuery({ queryKey: ['cities'], queryFn: api.cities })
  const cityName = (key: string) => cities.data?.find((c) => c.key === key)?.name.en ?? key

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['staff', 'sites'] })
    qc.invalidateQueries({ queryKey: ['sites'] }) // public catalog
  }

  const save = useMutation({
    mutationFn: ({ id, data }: { id: string | null; data: object }) =>
      id ? staffApi.updateSite(id, data) : staffApi.createSite(data),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
  })

  const setAvailable = useMutation({
    mutationFn: ({ id, available, reason }: { id: string; available: boolean; reason?: string }) =>
      staffApi.updateSite(id, {
        availability: available ? 'available' : 'temporarily_unavailable',
        unavailable_reason: available ? null : reason || null,
      }),
    onSuccess: () => {
      setPausing(null)
      refresh()
    },
  })

  const del = useMutation({
    mutationFn: (site: StaffSite) => staffApi.deleteSite(site.id, force),
    onSuccess: () => {
      setDeleting(null)
      setForce(false)
      refresh()
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) setForce(true)
    },
  })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <input
          className="input !w-64"
          placeholder="Search name or slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input !w-56"
          value={availability}
          onChange={(e) => setAvailability(e.target.value as '' | Availability)}
        >
          <option value="" className="bg-charcoal">
            All sites
          </option>
          <option value="available" className="bg-charcoal">
            Available
          </option>
          <option value="temporarily_unavailable" className="bg-charcoal">
            Temporarily unavailable
          </option>
        </select>
        {isAdmin && (
          <button className="btn btn-primary ml-auto" onClick={() => setEditing('new')}>
            New site
          </button>
        )}
      </div>

      {setAvailable.isError && (
        <p className="text-sm text-red-300/80 mb-4">{setAvailable.error.message}</p>
      )}
      {sites.isLoading && <p className="text-mist">Loading…</p>}
      {sites.isError && <p className="text-red-300/80">{(sites.error as Error).message}</p>}

      {sites.data && (
        <>
          <p className="text-xs text-mist mb-4">{sites.data.total} sites</p>
          <div className="flex flex-col gap-3">
            {sites.data.items.map((s) => {
              const paused = s.availability === 'temporarily_unavailable'
              return (
                <div key={s.id} className="glass p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="min-w-[14rem] flex-1">
                    <p className="text-lg font-serif leading-snug">
                      {s.name.en}
                      {s.name.ja && <span className="text-xs text-mist font-sans ml-3">{s.name.ja}</span>}
                    </p>
                    <p className="text-xs text-mist mt-1">
                      {s.slug} · {TYPE_LABEL[s.type] ?? s.type} · {cityName(s.city_id)}
                    </p>
                    {paused && s.unavailable_reason && (
                      <p className="text-xs text-amber-200/80 mt-1">Reason: {s.unavailable_reason}</p>
                    )}
                  </div>

                  <p className="text-sm text-mist w-24">{s.fee_jpy === 0 ? 'Free' : formatYen(s.fee_jpy)}</p>

                  <span
                    className={clsx(
                      'text-xs border rounded-full px-3 py-1',
                      paused ? 'text-amber-200 border-amber-300/30' : 'text-emerald-300 border-emerald-300/30',
                    )}
                  >
                    {paused ? 'Unavailable' : 'Available'}
                  </span>

                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-ghost !py-1.5 !px-4 text-xs" onClick={() => setEditing(s)}>
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost !py-1.5 !px-4 text-xs"
                      disabled={setAvailable.isPending}
                      onClick={() => (paused ? setAvailable.mutate({ id: s.id, available: true }) : setPausing(s))}
                    >
                      {paused ? 'Mark available' : 'Mark unavailable'}
                    </button>
                    {isAdmin && (
                      <button
                        className="btn btn-ghost !py-1.5 !px-4 text-xs !text-red-300/80 hover:!border-red-300/50"
                        onClick={() => setDeleting(s)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {sites.data.items.length === 0 && (
              <div className="glass p-10 text-center text-sm text-mist">No sites match.</div>
            )}
          </div>
        </>
      )}

      {editing && (
        <SiteForm
          site={editing === 'new' ? null : editing}
          regions={regions.data ?? []}
          cities={cities.data ?? []}
          pending={save.isPending}
          error={save.error?.message ?? null}
          onSubmit={(data) => save.mutate({ id: editing === 'new' ? null : editing.id, data })}
          onClose={() => {
            save.reset()
            setEditing(null)
          }}
        />
      )}

      {pausing && (
        <ConfirmDialog
          title={`Mark ${pausing.name.en} unavailable`}
          message="The site disappears from the public catalog and from newly generated or rebuilt itineraries. Saved itineraries keep it until they are rebuilt."
          confirmLabel="Mark unavailable"
          reasonLabel="Reason (optional)"
          pending={setAvailable.isPending}
          error={setAvailable.error?.message ?? null}
          onConfirm={(reason) => setAvailable.mutate({ id: pausing.id, available: false, reason })}
          onClose={() => {
            setAvailable.reset()
            setPausing(null)
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name.en}`}
          message={
            force
              ? 'Saved itineraries still include this site. Deleting anyway cannot be undone.'
              : 'This permanently removes the site from the catalog.'
          }
          confirmLabel={force ? 'Delete anyway' : 'Delete'}
          danger
          pending={del.isPending}
          error={del.error?.message ?? null}
          onConfirm={() => del.mutate(deleting)}
          onClose={() => {
            del.reset()
            setForce(false)
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}