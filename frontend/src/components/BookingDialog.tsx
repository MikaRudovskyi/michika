import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../hooks/useLang'
import { api } from '../lib/api'
import { dateLocale, formatDate, formatYen } from '../lib/format'
import { EASE } from '../lib/motion'
import type { Itinerary, StayOption, StaySegment } from '../lib/types'

interface Props {
  itinerary: Itinerary
  option: StayOption
  segment: StaySegment
  onClose: () => void
}

export default function BookingDialog({ itinerary, option, segment, onClose }: Props) {
  const { t } = useTranslation()
  const lang = useLang()
  const locale = dateLocale(lang)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const guests = itinerary.params.travelers

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fresh price and availability, not the cached recommendation.
  const quote = useQuery({
    queryKey: [
      'quote',
      option.accommodation_id,
      option.room_type_id,
      segment.check_in,
      segment.check_out,
      guests,
      option.rooms,
    ],
    queryFn: () =>
      api.quote({
        accommodationId: option.accommodation_id,
        roomTypeId: option.room_type_id,
        checkIn: segment.check_in,
        checkOut: segment.check_out,
        guests,
        rooms: option.rooms,
      }),
    staleTime: 0,
    gcTime: 0,
  })

  const accommodation = useQuery({
    queryKey: ['accommodation', option.accommodation_id, lang],
    queryFn: () => api.accommodation(option.accommodation_id, lang),
  })

  const book = useMutation({
    mutationFn: () =>
      api.createBooking({
        accommodation_id: option.accommodation_id,
        room_type_id: option.room_type_id,
        check_in: segment.check_in,
        check_out: segment.check_out,
        guests,
        rooms: option.rooms,
        itinerary_id: itinerary.id,
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stays'] })
      qc.invalidateQueries({ queryKey: ['bookings'] })
    },
  })

  const tiers = [...(accommodation.data?.cancellation_policy ?? [])].sort(
    (a, b) => b.days_before - a.days_before,
  )
  const canBook = !!quote.data?.available && !book.isPending

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-sumi/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClose}
    >
      <motion.div
        className="glass !bg-charcoal/90 w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.5, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
      >
        {book.isSuccess ? (
          <div className="text-center py-4">
            <p className="font-serif text-gold text-4xl mb-4">✓</p>
            <h2 className="text-2xl mb-3">{t('stays.booked')}</h2>
            <p className="text-sm text-mist leading-relaxed mb-8">{t('stays.bookedText')}</p>
            <div className="flex justify-center gap-3">
              <button className="btn btn-ghost" onClick={onClose}>
                {t('stays.close')}
              </button>
              <button className="btn btn-primary" onClick={() => navigate('/bookings')}>
                {t('stays.viewBookings')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="eyebrow !tracking-[0.2em] mb-3">
              {t(`stays.type.${option.type}`, { defaultValue: option.type })}
            </p>
            <h2 className="text-3xl leading-snug">{option.name}</h2>
            <p className="text-sm text-mist mt-1 mb-6">{option.room_name}</p>

            <div className="grid grid-cols-3 gap-4 text-sm mb-6">
              <div>
                <p className="text-[11px] text-mist mb-1">{t('stays.checkIn')}</p>
                <p>{formatDate(segment.check_in, locale)}</p>
              </div>
              <div>
                <p className="text-[11px] text-mist mb-1">{t('stays.checkOut')}</p>
                <p>{formatDate(segment.check_out, locale)}</p>
              </div>
              <div>
                <p className="text-[11px] text-mist mb-1">{t('stays.guests')}</p>
                <p>{guests}</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-4 mb-6">
              {quote.isLoading && <p className="text-sm text-mist">{t('common.loading')}</p>}
              {quote.isError && (
                <p className="text-sm text-red-300/80">{(quote.error as Error).message}</p>
              )}
              {quote.data && (
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[11px] text-mist">
                      {t('stays.nights', { count: quote.data.nights })} ·{' '}
                      {t('stays.rooms', { count: quote.data.rooms })}
                    </p>
                    <p className="font-serif text-3xl text-gold">{formatYen(quote.data.total_jpy)}</p>
                  </div>
                  <p className={quote.data.available ? 'text-xs text-gold' : 'text-xs text-red-300/80'}>
                    {quote.data.available ? t('stays.available') : t('stays.unavailable')}
                  </p>
                </div>
              )}
            </div>

            {tiers.length > 0 && (
              <div className="mb-6">
                <p className="text-xs text-mist mb-2">{t('stays.cancellationPolicy')}</p>
                <ul className="text-xs text-mist space-y-1 list-disc list-inside">
                  {tiers.map((tier) => (
                    <li key={tier.days_before}>
                      {tier.days_before > 0
                        ? t('stays.policyTier', { days: tier.days_before, pct: tier.refund_pct })
                        : t('stays.policyLast', { pct: tier.refund_pct })}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <textarea
              className="input mb-4"
              rows={2}
              maxLength={500}
              placeholder={t('stays.note')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <p className="text-xs text-mist mb-6">{t('stays.noPayment')}</p>
            {book.isError && (
              <p className="text-sm text-red-300/80 mb-4">{(book.error as Error).message}</p>
            )}

            <div className="flex justify-end gap-3">
              <button className="btn btn-ghost" onClick={onClose}>
                {t('stays.close')}
              </button>
              <button className="btn btn-primary" disabled={!canBook} onClick={() => book.mutate()}>
                {book.isPending ? t('stays.confirming') : t('stays.confirm')}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}