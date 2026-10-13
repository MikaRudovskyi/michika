import clsx from 'clsx'
import { Suspense, lazy, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaImage } from '../lib/mediaApi'
import Gallery from './Gallery'

// MapLibre is heavy: it is only loaded once someone opens the neighborhood tab.
const NeighborhoodPreview = lazy(() => import('./NeighborhoodPreview'))

interface Props {
  images: MediaImage[]
  title: string
  lngLat?: [number, number] | null
}

export default function PlaceShowcase({ images, title, lngLat }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'photos' | 'area'>('photos')
  const streetView = lngLat
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lngLat[1]},${lngLat[0]}`
    : null

  return (
    <div>
      {lngLat && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button className={clsx('chip', tab === 'photos' && 'chip-active')} onClick={() => setTab('photos')}>
            {t('media.photos')} · {images.length}
          </button>
          <button className={clsx('chip', tab === 'area' && 'chip-active')} onClick={() => setTab('area')}>
            {t('media.neighborhood')}
          </button>
          {tab === 'area' && streetView && (
            <a
              href={streetView}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-gold hover:underline"
            >
              {t('media.streetView')} ↗
            </a>
          )}
        </div>
      )}

      {tab === 'photos' || !lngLat ? (
        <Gallery images={images} title={title} />
      ) : (
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-charcoal">
          <Suspense
            fallback={
              <div className="absolute inset-0 grid place-items-center text-xs text-mist">{t('map.loading')}</div>
            }
          >
            <NeighborhoodPreview lngLat={lngLat} className="absolute inset-0" />
          </Suspense>
        </div>
      )}
    </div>
  )
}