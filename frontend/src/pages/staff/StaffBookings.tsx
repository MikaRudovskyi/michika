import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { useState } from 'react'
import ConfirmDialog from '../../components/staff/ConfirmDialog'
import { staffApi } from '../../lib/api'
import { formatDate, formatYen, todayISO } from '../../lib/format'
import { rise, stagger } from '../../lib/motion'
import type { BookingStatus } from '../../lib/types'
import type { StaffBooking } from '../../lib/types.staff'

const FILTERS: (BookingStatus | 'all')[] = ['pending', 'confirmed', 'completed', 'cancelled', 'all']

const LABEL: Record<BookingStatus, string> = {
  pending: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
}

const STYLE: Record<BookingStatus, string> = {
  pending: 'text-amber-200 border-amber-300/30',
  confirmed: 'text-emerald-300 border-emerald-300/30',
  cancelled: 'text-red-300/80 border-red-300/20',
  completed: 'text-mist border-white/15',
}

const FILTER_LABEL = (f: BookingStatus | 'all') => (f === 'all' ? 'All' : LABEL[f])
const DATE = 'en-GB'

export default function StaffBookings() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<BookingStatus | 'all'>('pending')
  const [cancelTarget, setCancelTarget] = useState<StaffBooking | null>(null)

  const list = useQuery({
    queryKey: ['staff', 'bookings', filter],
    queryFn: () => staffApi.bookings(filter === 'all' ? undefined : filter),
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['staff', 'bookings'] })
    qc.invalidateQueries({ queryKey: ['stays'] }) // cancelled rooms become available again
  }

  const confirm = useMutation({ mutationFn: (id: string) => staffApi.confirmBooking(id), onSuccess: refresh })
  const complete = useMutation({ mutationFn: (id: string) => staffApi.completeBooking(id), onSuccess: refresh })
  const cancel = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => staffApi.cancelBooking(id, note),
    onSuccess: () => {
      setCancelTarget(null)
      refresh()
    },
  })

  const actionError = (confirm.error ?? complete.error) as Error | null
  const today = todayISO()
  const busy = confirm.isPending || complete.isPending

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-8">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={clsx('chip', filter === f && 'chip-active')}>
            {FILTER_LABEL(f)}
          </button>
        ))}
      </div>

      {actionError && <p className="text-sm text-red-300/80 mb-6">{actionError.message}</p>}
      {list.isLoading && <p className="text-mist">Loading…</p>}
      {list.isError && <p className="text-red-300/80">{(list.error as Error).message}</p>}

      {list.data && list.data.items.length === 0 && (
        <div className="glass p-10 text-center text-sm text-mist">No bookings in this view.</div>
      )}

      {list.data && (
        <>
          <p className="text-xs text-mist mb-4">{list.data.total} total</p>
          <motion.div key={filter} variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-5">
            {list.data.items.map((b) => (
              <motion.article key={b.id} variants={rise} className="glass p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-2xl leading-snug">{b.accommodation_name}</h3>
                    <p className="text-xs text-mist mt-1">{b.room_name}</p>
                  </div>
                  <span className={clsx('text-xs border rounded-full px-3 py-1', STYLE[b.status])}>
                    {LABEL[b.status]}
                  </span>
                </div>

                <p className="text-sm mt-4">
                  {b.guest_name ?? 'Unknown guest'}
                  {b.guest_email && <span className="text-mist"> · {b.guest_email}</span>}
                </p>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
                  <div>
                    <p className="text-[11px] text-mist mb-1">Check-in</p>
                    <p>{formatDate(b.check_in, DATE)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-mist mb-1">Check-out</p>
                    <p>{formatDate(b.check_out, DATE)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-mist mb-1">Guests</p>
                    <p>{b.guests}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-mist mb-1">Rooms</p>
                    <p>{b.rooms}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-mist mb-1">Total</p>
                    <p className="font-serif text-xl text-gold">{formatYen(b.total_jpy)}</p>
                  </div>
                </div>

                {b.note && <p className="text-xs text-mist mt-4">Guest note: {b.note}</p>}

                {(b.status === 'pending' || b.status === 'confirmed') && (
                  <div className="mt-6 flex flex-wrap gap-3">
                    {b.status === 'pending' && (
                      <button
                        className="btn btn-primary !py-2 !px-5 text-xs"
                        disabled={busy}
                        onClick={() => confirm.mutate(b.id)}
                      >
                        Confirm
                      </button>
                    )}
                    {b.status === 'confirmed' && b.check_out <= today && (
                      <button
                        className="btn btn-primary !py-2 !px-5 text-xs"
                        disabled={busy}
                        onClick={() => complete.mutate(b.id)}
                      >
                        Mark completed
                      </button>
                    )}
                    <button
                      className="btn btn-ghost !py-2 !px-5 text-xs"
                      disabled={busy}
                      onClick={() => setCancelTarget(b)}
                    >
                      {b.status === 'pending' ? 'Decline' : 'Cancel booking'}
                    </button>
                  </div>
                )}
              </motion.article>
            ))}
          </motion.div>
        </>
      )}

      {cancelTarget && (
        <ConfirmDialog
          title={cancelTarget.status === 'pending' ? 'Decline booking' : 'Cancel booking'}
          message={`${cancelTarget.guest_name ?? 'The guest'} will be refunded ${formatYen(
            cancelTarget.total_jpy,
          )} in full, and the rooms become available again.`}
          confirmLabel={cancelTarget.status === 'pending' ? 'Decline booking' : 'Cancel booking'}
          reasonLabel="Note for the guest (optional)"
          danger
          pending={cancel.isPending}
          error={cancel.error?.message ?? null}
          onConfirm={(note) => cancel.mutate({ id: cancelTarget.id, note })}
          onClose={() => {
            cancel.reset()
            setCancelTarget(null)
          }}
        />
      )}
    </div>
  )
}