import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useState } from 'react'
import AccommodationForm from '../../components/staff/AccommodationForm'
import ConfirmDialog from '../../components/staff/ConfirmDialog'
import Modal from '../../components/staff/Modal'
import { api, staffApi } from '../../lib/api'
import { formatYen } from '../../lib/format'
import type { AccommodationPayload, StaffAccommodation } from '../../lib/types.staff'
import { useAuth } from '../../store/auth'

const KIND: Record<string, string> = { hotel: 'Hotel', ryokan: 'Ryokan', machiya: 'Machiya', hostel: 'Hostel' }

type Editing = StaffAccommodation | 'new' | null

export default function StaffAccommodations() {
  const qc = useQueryClient()
  const me = useAuth((s) => s.user)
  const isAdmin = me?.role === 'admin'

  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<StaffAccommodation | null>(null)
  const [reassigning, setReassigning] = useState<StaffAccommodation | null>(null)

  const list = useQuery({ queryKey: ['staff', 'accommodations'], queryFn: staffApi.accommodations })
  const regions = useQuery({ queryKey: ['regions'], queryFn: api.regions })
  const cities = useQuery({ queryKey: ['cities'], queryFn: api.cities })
  const managers = useQuery({
    queryKey: ['admin', 'users', 'managers'],
    queryFn: () => staffApi.users({ role: 'manager' }),
    enabled: isAdmin,
  })

  const owners = isAdmin
    ? [
        { id: me?.id ?? '', label: 'Me (administrator)' },
        ...(managers.data?.items ?? []).map((m) => ({ id: m.id, label: `${m.name} · ${m.email}` })),
      ]
    : null

  const cityName = (key: string) => cities.data?.find((c) => c.key === key)?.name.en ?? key

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['staff', 'accommodations'] })
    qc.invalidateQueries({ queryKey: ['staff', 'stats'] })
    qc.invalidateQueries({ queryKey: ['stays'] })
    qc.invalidateQueries({ queryKey: ['accommodation'] })
  }

  const save = useMutation({
    mutationFn: ({ id, data, ownerId }: { id: string | null; data: AccommodationPayload; ownerId: string }) =>
      id ? staffApi.updateAccommodation(id, data) : staffApi.createAccommodation(data, isAdmin ? ownerId : undefined),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
  })

  const toggle = useMutation({
    mutationFn: (a: StaffAccommodation) =>
      staffApi.updateAccommodation(a.id, { status: a.status === 'active' ? 'hidden' : 'active' }),
    onSuccess: refresh,
  })

  const del = useMutation({
    mutationFn: (a: StaffAccommodation) => staffApi.deleteAccommodation(a.id),
    onSuccess: () => {
      setDeleting(null)
      refresh()
    },
  })

  const reassign = useMutation({
    mutationFn: ({ id, ownerId }: { id: string; ownerId: string }) => staffApi.setAccommodationOwner(id, ownerId),
    onSuccess: () => {
      setReassigning(null)
      refresh()
      qc.invalidateQueries({ queryKey: ['staff', 'bookings'] })
    },
  })

  const needle = search.trim().toLowerCase()
  const items = (list.data ?? []).filter(
    (a) =>
      !needle ||
      a.name.en.toLowerCase().includes(needle) ||
      (a.name.ja ?? '').includes(search.trim()) ||
      cityName(a.city_id).toLowerCase().includes(needle),
  )

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <input
          className="input !w-64"
          placeholder="Search name or city…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-primary ml-auto" onClick={() => setEditing('new')}>
          New property
        </button>
      </div>

      {toggle.isError && <p className="text-sm text-red-300/80 mb-4">{toggle.error.message}</p>}
      {list.isLoading && <p className="text-mist">Loading…</p>}
      {list.isError && <p className="text-red-300/80">{(list.error as Error).message}</p>}

      <div className="flex flex-col gap-3">
        {items.map((a) => {
          const hidden = a.status === 'hidden'
          return (
            <div key={a.id} className="glass p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="min-w-[14rem] flex-1">
                <p className="text-lg font-serif leading-snug">
                  {a.name.en}
                  {a.name.ja && <span className="text-xs text-mist font-sans ml-3">{a.name.ja}</span>}
                </p>
                <p className="text-xs text-mist mt-1">
                  {KIND[a.type] ?? a.type} · {cityName(a.city_id)} · {a.rooms.length} room type(s) · from{' '}
                  {formatYen(Math.min(...a.rooms.map((r) => r.base_price_jpy)))} · ★ {a.rating.toFixed(1)}
                </p>
                {isAdmin && (
                  <p className="text-xs text-mist/80 mt-1">Owner: {a.owner_email ?? a.owner_id}</p>
                )}
              </div>

              <span
                className={clsx(
                  'text-xs border rounded-full px-3 py-1',
                  hidden ? 'text-amber-200 border-amber-300/30' : 'text-emerald-300 border-emerald-300/30',
                )}
              >
                {hidden ? 'Hidden' : 'Active'}
              </span>

              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost !py-1.5 !px-4 text-xs" onClick={() => setEditing(a)}>
                  Edit
                </button>
                <button
                  className="btn btn-ghost !py-1.5 !px-4 text-xs"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(a)}
                >
                  {hidden ? 'Show' : 'Hide'}
                </button>
                {isAdmin && (
                  <>
                    <button className="btn btn-ghost !py-1.5 !px-4 text-xs" onClick={() => setReassigning(a)}>
                      Reassign owner
                    </button>
                    <button
                      className="btn btn-ghost !py-1.5 !px-4 text-xs !text-red-300/80 hover:!border-red-300/50"
                      onClick={() => setDeleting(a)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
        {list.data && items.length === 0 && (
          <div className="glass p-10 text-center text-sm text-mist">No properties found.</div>
        )}
      </div>

      {editing && (
        <AccommodationForm
          acc={editing === 'new' ? null : editing}
          regions={regions.data ?? []}
          cities={cities.data ?? []}
          owners={owners}
          defaultOwnerId={me?.id ?? ''}
          pending={save.isPending}
          error={save.error?.message ?? null}
          onSubmit={(data, ownerId) => save.mutate({ id: editing === 'new' ? null : editing.id, data, ownerId })}
          onClose={() => {
            save.reset()
            setEditing(null)
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name.en}`}
          message="The property and its availability records are removed permanently. Properties with active bookings cannot be deleted: hide them instead."
          confirmLabel="Delete"
          danger
          pending={del.isPending}
          error={del.error?.message ?? null}
          onConfirm={() => del.mutate(deleting)}
          onClose={() => {
            del.reset()
            setDeleting(null)
          }}
        />
      )}

      {reassigning && owners && (
        <OwnerDialog
          acc={reassigning}
          owners={owners}
          pending={reassign.isPending}
          error={reassign.error?.message ?? null}
          onSubmit={(ownerId) => reassign.mutate({ id: reassigning.id, ownerId })}
          onClose={() => {
            reassign.reset()
            setReassigning(null)
          }}
        />
      )}
    </div>
  )
}

function OwnerDialog({
  acc,
  owners,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  acc: StaffAccommodation
  owners: { id: string; label: string }[]
  pending: boolean
  error: string | null
  onSubmit: (ownerId: string) => void
  onClose: () => void
}) {
  const [ownerId, setOwnerId] = useState(acc.owner_id)

  return (
    <Modal title={`Reassign ${acc.name.en}`} onClose={onClose}>
      <p className="text-sm text-mist leading-relaxed mb-5">
        The new owner receives the property and all of its bookings, past and present. They will see them in their
        own back office.
      </p>
      <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
        {!owners.some((o) => o.id === acc.owner_id) && (
          <option value={acc.owner_id} className="bg-charcoal">
            {acc.owner_email ?? acc.owner_id} (current)
          </option>
        )}
        {owners.map((o) => (
          <option key={o.id} value={o.id} className="bg-charcoal">
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-300/80 mt-4">{error}</p>}
      <div className="flex justify-end gap-3 mt-8">
        <button className="btn btn-ghost" onClick={onClose} disabled={pending}>
          Back
        </button>
        <button
          className="btn btn-primary"
          disabled={pending || ownerId === acc.owner_id}
          onClick={() => onSubmit(ownerId)}
        >
          {pending ? 'Working…' : 'Reassign'}
        </button>
      </div>
    </Modal>
  )
}