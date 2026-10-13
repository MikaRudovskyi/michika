import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { staffApi } from '../../lib/api'

const PAGE = 50

const FILTERS = [
  { value: '', label: 'All actions' },
  { value: 'booking.', label: 'Bookings' },
  { value: 'site.', label: 'Cultural sites' },
  { value: 'accommodation.', label: 'Accommodations' },
  { value: 'user.', label: 'User accounts' },
  { value: 'manager.', label: 'Manager accounts' },
  { value: 'region.', label: 'Regions' },
  { value: 'city.', label: 'Cities' },
]

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export default function AdminLogs() {
  const [action, setAction] = useState('')
  const [page, setPage] = useState(0)

  const logs = useQuery({
    queryKey: ['admin', 'logs', action, page],
    queryFn: () => staffApi.logs({ action: action || undefined, skip: page * PAGE, limit: PAGE }),
  })

  const total = logs.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <select
          className="input !w-56"
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(0)
          }}
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value} className="bg-charcoal">
              {f.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-mist ml-auto">{total} entries</p>
      </div>

      {logs.isLoading && <p className="text-mist">Loading…</p>}
      {logs.isError && <p className="text-red-300/80">{(logs.error as Error).message}</p>}

      {logs.data && (
        <div className="glass overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-widest text-mist border-b border-white/10">
                <th className="px-5 py-3 font-normal">When</th>
                <th className="px-5 py-3 font-normal">Actor</th>
                <th className="px-5 py-3 font-normal">Action</th>
                <th className="px-5 py-3 font-normal">Target</th>
                <th className="px-5 py-3 font-normal">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.data.items.map((l) => {
                const meta = JSON.stringify(l.meta)
                return (
                  <tr key={l.id} className="border-b border-white/5 align-top">
                    <td className="px-5 py-3 whitespace-nowrap text-mist">{when(l.at)}</td>
                    <td className="px-5 py-3">
                      {l.actor_email ?? l.actor_id}
                      <span className="block text-[11px] text-mist">{l.actor_role}</span>
                    </td>
                    <td className="px-5 py-3 text-gold whitespace-nowrap">{l.action}</td>
                    <td className="px-5 py-3 text-mist">
                      {l.target_type}
                      <span className="block text-[11px]">{l.target_id.slice(-8)}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-mist max-w-xs break-words" title={meta}>
                      {meta.length > 120 ? `${meta.slice(0, 120)}…` : meta === '{}' ? '' : meta}
                    </td>
                  </tr>
                )
              })}
              {logs.data.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-mist">
                    No entries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 mt-6">
        <button className="btn btn-ghost !py-2 !px-5 text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Newer
        </button>
        <span className="text-xs text-mist">
          {page + 1} / {pages}
        </span>
        <button
          className="btn btn-ghost !py-2 !px-5 text-xs"
          disabled={page + 1 >= pages}
          onClick={() => setPage(page + 1)}
        >
          Older
        </button>
      </div>
    </div>
  )
}