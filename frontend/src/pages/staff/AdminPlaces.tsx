import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import ConfirmDialog from '../../components/staff/ConfirmDialog'
import Modal from '../../components/staff/Modal'
import { api, staffApi } from '../../lib/api'
import type { City, I18nText, Region } from '../../lib/types.staff'

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type Target =
  | { kind: 'region'; mode: 'create' }
  | { kind: 'region'; mode: 'edit'; region: Region }
  | { kind: 'city'; mode: 'create'; region: Region }
  | { kind: 'city'; mode: 'edit'; city: City }

interface Doomed {
  kind: 'region' | 'city'
  key: string
  label: string
}

const titleOf = (t: Target) => {
  if (t.kind === 'region') return t.mode === 'create' ? 'New region' : `Rename ${t.region.name.en}`
  return t.mode === 'create' ? `New city in ${t.region.name.en}` : `Rename ${t.city.name.en}`
}

export default function AdminPlaces() {
  const qc = useQueryClient()
  const [target, setTarget] = useState<Target | null>(null)
  const [doomed, setDoomed] = useState<Doomed | null>(null)

  const regions = useQuery({ queryKey: ['regions'], queryFn: api.regions })
  const cities = useQuery({ queryKey: ['cities'], queryFn: api.cities })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['regions'] })
    qc.invalidateQueries({ queryKey: ['cities'] })
    qc.invalidateQueries({ queryKey: ['staff', 'stats'] })
  }

  const save = useMutation({
    mutationFn: ({ target: t, key, name }: { target: Target; key: string; name: I18nText }) => {
      if (t.kind === 'region') {
        return t.mode === 'create' ? staffApi.createRegion({ key, name }) : staffApi.renameRegion(t.region.key, name)
      }
      return t.mode === 'create'
        ? staffApi.createCity({ key, region_key: t.region.key, name })
        : staffApi.renameCity(t.city.key, name)
    },
    onSuccess: () => {
      setTarget(null)
      refresh()
    },
  })

  const del = useMutation({
    mutationFn: (d: Doomed) => (d.kind === 'region' ? staffApi.deleteRegion(d.key) : staffApi.deleteCity(d.key)),
    onSuccess: () => {
      setDoomed(null)
      refresh()
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <p className="text-xs text-mist max-w-xl">
          Regions and cities are the lists that cultural sites and properties choose from. A region or city that is
          still in use cannot be deleted.
        </p>
        <button className="btn btn-primary" onClick={() => setTarget({ kind: 'region', mode: 'create' })}>
          New region
        </button>
      </div>

      {regions.isLoading && <p className="text-mist">Loading…</p>}
      {regions.isError && <p className="text-red-300/80">{(regions.error as Error).message}</p>}

      <div className="flex flex-col gap-6">
        {regions.data?.map((r) => {
          const own = (cities.data ?? []).filter((c) => c.region_key === r.key)
          return (
            <div key={r.id} className="glass p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-2xl leading-snug">
                    {r.name.en}
                    {r.name.ja && <span className="text-sm text-mist font-sans ml-3">{r.name.ja}</span>}
                  </h3>
                  <p className="text-xs text-mist mt-1">
                    {r.key} · {own.length} cit{own.length === 1 ? 'y' : 'ies'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-ghost !py-1.5 !px-4 text-xs"
                    onClick={() => setTarget({ kind: 'city', mode: 'create', region: r })}
                  >
                    Add city
                  </button>
                  <button
                    className="btn btn-ghost !py-1.5 !px-4 text-xs"
                    onClick={() => setTarget({ kind: 'region', mode: 'edit', region: r })}
                  >
                    Rename
                  </button>
                  <button
                    className="btn btn-ghost !py-1.5 !px-4 text-xs !text-red-300/80 hover:!border-red-300/50"
                    onClick={() => setDoomed({ kind: 'region', key: r.key, label: r.name.en })}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {own.length > 0 && (
                <ul className="mt-5 flex flex-col divide-y divide-white/5 border-t border-white/10">
                  {own.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span className="text-sm">
                        {c.name.en}
                        {c.name.uk && <span className="text-xs text-mist ml-3">{c.name.uk}</span>}
                        {c.name.ja && <span className="text-xs text-mist ml-3">{c.name.ja}</span>}
                        <span className="text-[11px] text-mist/70 ml-3">{c.key}</span>
                      </span>
                      <span className="flex gap-4 text-xs">
                        <button className="text-mist hover:text-gold" onClick={() => setTarget({ kind: 'city', mode: 'edit', city: c })}>
                          Rename
                        </button>
                        <button
                          className="text-red-300/80 hover:underline"
                          onClick={() => setDoomed({ kind: 'city', key: c.key, label: c.name.en })}
                        >
                          Delete
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
        {regions.data?.length === 0 && (
          <div className="glass p-10 text-center text-sm text-mist">No regions yet. Create the first one.</div>
        )}
      </div>

      {target && (
        <PlaceDialog
          target={target}
          pending={save.isPending}
          error={save.error?.message ?? null}
          onSubmit={(key, name) => save.mutate({ target, key, name })}
          onClose={() => {
            save.reset()
            setTarget(null)
          }}
        />
      )}

      {doomed && (
        <ConfirmDialog
          title={`Delete ${doomed.label}`}
          message={`This removes the ${doomed.kind} from the lists. It is refused while sites or properties still use it.`}
          confirmLabel="Delete"
          danger
          pending={del.isPending}
          error={del.error?.message ?? null}
          onConfirm={() => del.mutate(doomed)}
          onClose={() => {
            del.reset()
            setDoomed(null)
          }}
        />
      )}
    </div>
  )
}

function PlaceDialog({
  target,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  target: Target
  pending: boolean
  error: string | null
  onSubmit: (key: string, name: I18nText) => void
  onClose: () => void
}) {
  const existing = target.mode === 'edit' ? (target.kind === 'region' ? target.region : target.city) : null
  const [key, setKey] = useState(existing?.key ?? '')
  const [en, setEn] = useState(existing?.name.en ?? '')
  const [uk, setUk] = useState(existing?.name.uk ?? '')
  const [ja, setJa] = useState(existing?.name.ja ?? '')
  const [localError, setLocalError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (target.mode === 'create' && (!KEY.test(key.trim()) || key.trim().length < 2)) {
      setLocalError('Key: at least 2 characters, lowercase letters, digits and single hyphens only.')
      return
    }
    if (!en.trim()) {
      setLocalError('The English name is required.')
      return
    }
    setLocalError(null)
    onSubmit(key.trim(), { en: en.trim(), uk: uk.trim() || null, ja: ja.trim() || null })
  }

  return (
    <Modal title={titleOf(target)} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <input
            className="input"
            placeholder="Key, e.g. kyoto"
            value={key}
            disabled={target.mode === 'edit'}
            onChange={(e) => setKey(e.target.value)}
          />
          <p className="text-[11px] text-mist/70 mt-1">
            {target.mode === 'create' ? 'Used by sites and properties. Cannot be changed later.' : 'The key cannot be changed.'}
          </p>
        </div>
        <input className="input" placeholder="Name (English)" value={en} onChange={(e) => setEn(e.target.value)} />
        <input className="input" placeholder="Name (Ukrainian)" value={uk} onChange={(e) => setUk(e.target.value)} />
        <input className="input" placeholder="Name (Japanese)" value={ja} onChange={(e) => setJa(e.target.value)} />

        {(localError || error) && <p className="text-sm text-red-300/80">{localError ?? error}</p>}

        <div className="flex justify-end gap-3 mt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Back
          </button>
          <button className="btn btn-primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}