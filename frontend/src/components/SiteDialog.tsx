import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatYen } from '../lib/format'
import { mediaApi } from '../lib/mediaApi'
import type { SiteItem } from '../lib/types'
import BestTimeDialog from './BestTimeDialog'
import PlaceShowcase from './PlaceShowcase'
import Modal from './staff/Modal'

const pad = (n: number) => String(n).padStart(2, '0')

export default function SiteDialog({ site, onClose }: { site: SiteItem; onClose: () => void }) {
  const { t } = useTranslation()
  const [bestTime, setBestTime] = useState(false)
  const images = useQuery({
    queryKey: ['media', 'site', site.id],
    queryFn: () => mediaApi.list('site', site.id),
  })

  return (
    <>
      <Modal
        title={site.name}
        // Escape closes the best-time dialog first, not both at once.
        onClose={() => {
          if (!bestTime) onClose()
        }}
        wide
      >
        <div className="flex flex-col gap-6">
          <PlaceShowcase images={images.data ?? []} title={site.name} lngLat={site.location.coordinates} />

          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="mb-1 text-[11px] text-mist">{t('media.facts.fee')}</dt>
              <dd>{site.fee_jpy === 0 ? t('card.free') : formatYen(site.fee_jpy)}</dd>
            </div>
            <div>
              <dt className="mb-1 text-[11px] text-mist">{t('media.facts.hours')}</dt>
              <dd>
                {pad(site.open_hour)}:00 – {pad(site.close_hour)}:00
              </dd>
            </div>
            <div>
              <dt className="mb-1 text-[11px] text-mist">{t('media.facts.duration')}</dt>
              <dd>{t('card.min', { count: site.avg_duration_min })}</dd>
            </div>
          </dl>

          {site.description && <p className="text-sm leading-relaxed text-mist">{site.description}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow !tracking-[0.2em] mr-2">{t(`types.${site.type}`)}</span>
            {site.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-mist">
                {t(`tag.${tag}`, { defaultValue: tag })}
              </span>
            ))}
            <button className="btn btn-ghost !py-2 !px-5 ml-auto text-xs" onClick={() => setBestTime(true)}>
              {t('smart.dialog.open')}
            </button>
          </div>
        </div>
      </Modal>

      {bestTime && <BestTimeDialog siteId={site.id} name={site.name} onClose={() => setBestTime(false)} />}
    </>
  )
}