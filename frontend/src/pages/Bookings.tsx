import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useLang } from '../hooks/useLang'
import { api } from '../lib/api'
import { dateLocale, formatDate, formatYen, todayISO } from '../lib/format'
import { EASE, rise, stagger } from '../lib/motion'
import type { Booking, BookingStatus } from '../lib/types'

const STATUSES: BookingStatus[] = ['pending', 'confirmed', 'cancelled', 'completed']

const STATUS_STYLE: Record<BookingStatus, string> = {
  pending: 'text-amber-200 border-amber-300/30',
  confirmed: 'text-emerald-300 border-emerald-300/30',
  cancelled: 'text-red-300/80 border-red-300/20',
  completed: 'text-mist border-white/15',
}

function BookingCard({ b }: { b: Booking }) {
  const { t } = useTranslation()
  const lang = useLang()
  const locale = dateLocale(lang)
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)

  const canCancel = (b.status === 'pending' || b.status === 'confirmed') && b.check_in >= todayISO()

  const preview = useQuery({
    queryKey: ['bookings', 'preview', b.id],
    queryFn: () => api.cancellationPreview(b.id),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  })

  const cancel = useMutation({
    mutationFn: () => api.cancelBooking(b.id),
    onSuccess: () => {
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['bookings'] })
      qc.invalidateQueries({ queryKey: ['stays'] }) // rooms were released
    },
  })

  return (
    <motion.article variants={rise} className="glass p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-2xl leading-snug">{b.accommodation_name}</h3>
          <p className="text-xs text-mist mt-1">{b.room_name}</p>
        </div>
        <span className={clsx('text-xs border rounded-full px-3 py-1', STATUS_STYLE[b.status])}>
          {t(`bookings.status.${b.status}`)}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
        <div>
          <p className="text-[11px] text-mist mb-1">{t('bookings.checkIn')}</p>
          <p>{formatDate(b.check_in, locale)}</p>
        </div>
        <div>
          <p className="text-[11px] text-mist mb-1">{t('bookings.checkOut')}</p>
          <p>{formatDate(b.check_out, locale)}</p>
        </div>
        <div>
          <p className="text-[11px] text-mist mb-1">{t('bookings.guests')}</p>
          <p>{b.guests}</p>
        </div>
        <div>
          <p className="text-[11px] text-mist mb-1">{t('bookings.rooms')}</p>
          <p>{b.rooms}</p>
        </div>
        <div>
          <p className="text-[11px] text-mist mb-1">{t('bookings.total')}</p>
          <p className="font-serif text-xl text-gold">{formatYen(b.total_jpy)}</p>
        </div>
      </div>

      {b.status === 'cancelled' && b.refund_jpy !== null && (
        <p className="text-xs text-mist mt-4">
          {t('bookings.refunded', { amount: formatYen(b.refund_jpy) })}
        </p>
      )}

      {canCancel && !open && (
        <div className="mt-6">
          <button className="btn btn-ghost !py-2 !px-5 text-xs" onClick={() => setOpen(true)}>
            {t('bookings.cancel')}
          </button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mt-6 rounded-xl border border-white/10 p-5">
              {preview.isLoading && <p className="text-sm text-mist">{t('common.loading')}</p>}
              {preview.isError && (
                <p className="text-sm text-red-300/80">{(preview.error as Error).message}</p>
              )}
              {preview.data && (
                <div className="space-y-1">
                  <p className="text-xs text-mist">
                    {t('bookings.daysUntil', { count: preview.data.days_until_check_in })}
                  </p>
                  <p className="text-sm">
                    {preview.data.refund_pct > 0
                      ? t('bookings.refund', {
                          pct: preview.data.refund_pct,
                          amount: formatYen(preview.data.refund_jpy),
                        })
                      : t('bookings.noRefund')}
                  </p>
                </div>
              )}
              {cancel.isError && (
                <p className="text-sm text-red-300/80 mt-3">{(cancel.error as Error).message}</p>
              )}
              <div className="flex gap-3 mt-5">
                <button className="btn btn-ghost !py-2 !px-5 text-xs" onClick={() => setOpen(false)}>
                  {t('bookings.keep')}
                </button>
                <button
                  className="btn btn-primary !py-2 !px-5 text-xs"
                  disabled={!preview.data || cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  {t('bookings.confirmCancel')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

export default function Bookings() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<BookingStatus | 'all'>('all')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['bookings'],
    queryFn: api.myBookings,
  })

  const items = (data ?? []).filter((b) => filter === 'all' || b.status === filter)

  return (
    <div className="mx-auto max-w-4xl px-6 pb-24">
      <header className="py-12">
        <p className="eyebrow mb-4">{t('bookings.subtitle')}</p>
        <h1 className="text-4xl sm:text-5xl">{t('bookings.title')}</h1>
      </header>

      <div className="flex flex-wrap gap-2 mb-8">
        <button onClick={() => setFilter('all')} className={clsx('chip', filter === 'all' && 'chip-active')}>
          {t('bookings.all')}
        </button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={clsx('chip', filter === s && 'chip-active')}>
            {t(`bookings.status.${s}`)}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-mist">{t('common.loading')}</p>}
      {isError && <p className="text-red-300/80">{(error as Error).message}</p>}

      {data && items.length === 0 && (
        <div className="glass p-10 text-center">
          <p className="text-mist text-sm mb-6">{t('bookings.empty')}</p>
          <Link to="/planner" className="btn btn-primary">
            {t('bookings.plan')}
          </Link>
        </div>
      )}

      <motion.div
        key={filter}
        variants={stagger}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-5"
      >
        {items.map((b) => (
          <BookingCard key={b.id} b={b} />
        ))}
      </motion.div>
    </div>
  )
}