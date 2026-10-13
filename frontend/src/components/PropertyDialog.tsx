import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useLang } from '../hooks/useLang'
import { api } from '../lib/api'
import { formatYen } from '../lib/format'
import { mediaApi } from '../lib/mediaApi'
import type { AccommodationDetail } from '../lib/types'
import PlaceShowcase from './PlaceShowcase'
import Modal from './staff/Modal'

// The public endpoint also returns these; the shared type does not list them.
type Detail = AccommodationDetail & {
  location: { coordinates: [number, number] }
  from_price_jpy: number
}

interface Props {
  accommodationId: string
  name: string
  onBook?: () => void
  onClose: () => void
}

export default function PropertyDialog({ accommodationId, name, onBook, onClose }: Props) {
  const { t } = useTranslation()
  const lang = useLang()

  const images = useQuery({
    queryKey: ['media', 'accommodation', accommodationId],
    queryFn: () => mediaApi.list('accommodation', accommodationId),
  })
  const detail = useQuery({
    queryKey: ['accommodation', accommodationId, lang],
    queryFn: () => api.accommodation(accommodationId, lang) as Promise<Detail>,
  })
  const d = detail.data

  return (
    <Modal title={name} onClose={onClose} wide>
      <div className="flex flex-col gap-6">
        <PlaceShowcase images={images.data ?? []} title={name} lngLat={d?.location.coordinates ?? null} />

        {d && (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
              <span className="eyebrow !tracking-[0.2em]">{t(`stays.type.${d.type}`, { defaultValue: d.type })}</span>
              <span className="text-mist">★ {d.rating.toFixed(1)}</span>
              <span className="text-mist">{t('map.fromPrice', { price: formatYen(d.from_price_jpy) })}</span>
            </div>
            {d.description && <p className="text-sm leading-relaxed text-mist">{d.description}</p>}
            {d.amenities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {d.amenities.map((a) => (
                  <span key={a} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-mist">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        {onBook && (
          <div className="flex justify-end">
            <button className="btn btn-primary" onClick={onBook}>
              {t('stays.book')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}