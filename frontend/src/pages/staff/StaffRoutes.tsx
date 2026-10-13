import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import Modal from '../../components/staff/Modal'
import { staffApi } from '../../lib/api'
import { formatDate, formatTime, formatYen } from '../../lib/format'

const PAGE = 20
const DATE = 'en-GB'

export default function StaffRoutes() {
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['staff', 'routes', page],
    queryFn: () => staffApi.itineraries({ skip: page * PAGE, limit: PAGE }),
  })

  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div>
      <p className="text-xs text-mist mb-6">{total} saved routes, newest first</p>

      {list.isLoading && <p className="text-mist">Loading…</p>}
      {list.isError && <p className="text-red-300/80">{(list.error as Error).message}</p>}

      <div className="flex flex-col gap-3">
        {list.data?.items.map((r) => (
          <div key={r.id} className="glass p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-[14rem] flex-1">
              <p className="text-lg font-serif leading-snug">{r.owner_name ?? 'Unknown traveller'}</p>
              <p className="text-xs text-mist mt-1">{r.owner_email ?? r.owner_id}</p>
            </div>

            <div className="text-sm">
              <p>
                {r.days} day(s) · {r.stops} stop(s) · {r.travelers} traveller(s)
              </p>
              <p className="text-xs text-mist mt-1">
                {r.start_date ? `Starts ${formatDate(r.start_date, DATE)}` : 'No start date'} · v{r.version}
              </p>
            </div>

            <div className="text-right">
              <p className="font-serif text-xl text-gold">{formatYen(r.total_jpy)}</p>
              <p className="text-xs text-mist">of {formatYen(r.budget_jpy)} budget</p>
            </div>

            <button className="btn btn-ghost !py-1.5 !px-4 text-xs" onClick={() => setOpenId(r.id)}>
              View
            </button>
          </div>
        ))}
        {list.data && list.data.items.length === 0 && (
          <div className="glass p-10 text-center text-sm text-mist">No routes have been saved yet.</div>
        )}
      </div>

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

      {openId && <RouteDetail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function RouteDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const route = useQuery({ queryKey: ['staff', 'route', id], queryFn: () => staffApi.itinerary(id) })
  const r = route.data

  return (
    <Modal title={r ? `Route of ${r.owner_name ?? 'a traveller'}` : 'Route'} onClose={onClose} wide>
      {route.isLoading && <p className="text-mist">Loading…</p>}
      {route.isError && <p className="text-red-300/80">{(route.error as Error).message}</p>}

      {r && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <p className="text-xs text-mist">
              {r.owner_email} · {r.params.travelers} traveller(s) · budget {formatYen(r.params.budget_jpy)}
            </p>
            <p className="font-serif text-3xl text-gold">{formatYen(r.cost.total_jpy)}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-mist">
            <p>Entry fees <span className="block text-sm text-washi">{formatYen(r.cost.entry_fees_jpy)}</span></p>
            <p>Transport <span className="block text-sm text-washi">{formatYen(r.cost.transport_jpy)}</span></p>
            <p>Lodging <span className="block text-sm text-washi">{formatYen(r.cost.lodging_jpy)}</span></p>
            <p>Extras <span className="block text-sm text-washi">{formatYen(r.cost.extras_jpy)}</span></p>
          </div>

          {r.warnings.length > 0 && (
            <ul className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4 text-xs text-mist space-y-1 list-disc list-inside">
              {r.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {r.days.map((day) => (
            <div key={day.index}>
              <h3 className="text-lg mb-3">
                Day {day.index + 1}
                {day.date && <span className="text-xs text-mist font-sans ml-3">{formatDate(day.date, DATE)}</span>}
              </h3>
              {day.stops.length === 0 ? (
                <p className="text-sm text-mist">Free day</p>
              ) : (
                <ol className="border-l border-white/10 ml-2 pl-5 space-y-3">
                  {day.stops.map((s) => (
                    <li key={s.site_id}>
                      <p className="text-xs text-mist">
                        {formatTime(s.start_min)} – {formatTime(s.end_min)}
                        {s.entry_fee_jpy > 0 && ` · ${formatYen(s.entry_fee_jpy)}`}
                      </p>
                      <p className="font-serif">{r.site_names[s.site_id] ?? '(deleted site)'}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}