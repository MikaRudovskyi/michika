import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import logo from '../assets/michika-bg-1000.png'
import type { MediaImage } from '../lib/mediaApi'
import { EASE } from '../lib/motion'
import ResponsiveImage from './ResponsiveImage'

interface Props {
  images: MediaImage[]
  title: string
}

export default function Gallery({ images, title }: Props) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const count = images.length
  const current = Math.min(index, Math.max(0, count - 1))
  const step = useCallback((delta: number) => setIndex((i) => (i + delta + count) % count), [count])

  if (count === 0) {
    return (
      <div className="relative grid aspect-[16/10] place-items-center overflow-hidden rounded-xl border border-white/10 bg-charcoal">
        <img src={logo} alt="" className="w-1/2 max-w-xs select-none opacity-20" draggable={false} />
        <p className="absolute bottom-3 text-xs text-mist">{t('media.noPhotos')}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-charcoal">
        <AnimatePresence initial={false}>
          <motion.button
            key={images[current].id}
            type="button"
            aria-label={t('media.enlarge')}
            onClick={() => setZoomed(true)}
            className="absolute inset-0 cursor-zoom-in"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <ResponsiveImage
              image={images[current]}
              sizes="(min-width: 768px) 720px, 92vw"
              fallbackAlt={title}
              className="h-full w-full"
            />
          </motion.button>
        </AnimatePresence>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label={t('media.previous')}
              onClick={() => step(-1)}
              className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-sumi/60 text-xl text-washi backdrop-blur transition-colors hover:text-gold"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label={t('media.next')}
              onClick={() => step(1)}
              className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-sumi/60 text-xl text-washi backdrop-blur transition-colors hover:text-gold"
            >
              ›
            </button>
            <p className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-sumi/60 px-3 py-1 text-[11px] text-washi backdrop-blur">
              {t('media.photoOf', { n: current + 1, total: count })}
            </p>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              aria-label={t('media.photoOf', { n: i + 1, total: count })}
              onClick={() => setIndex(i)}
              className={clsx(
                'relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border transition-all duration-500 ease-calm',
                i === current ? 'border-gold' : 'border-white/10 opacity-70 hover:opacity-100',
              )}
            >
              <ResponsiveImage image={image} sizes="80px" fallbackAlt="" className="h-full w-full" />
            </button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {zoomed && (
          <Lightbox
            images={images}
            index={current}
            title={title}
            onStep={step}
            onClose={() => setZoomed(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

interface LightboxProps {
  images: MediaImage[]
  index: number
  title: string
  onStep: (delta: number) => void
  onClose: () => void
}

function Lightbox({ images, index, title, onStep, onClose }: LightboxProps) {
  const { t } = useTranslation()

  useEffect(() => {
    // Capture phase, so Escape closes only the lightbox and not the dialog behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        onClose()
      } else if (e.key === 'ArrowLeft') onStep(-1)
      else if (e.key === 'ArrowRight') onStep(1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, onStep])

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-sumi/95 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClose}
    >
      <div className="relative h-[86vh] w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <ResponsiveImage
          image={images[index]}
          sizes="92vw"
          fit="contain"
          fallbackAlt={title}
          className="h-full w-full"
        />
      </div>

      <button
        type="button"
        aria-label={t('media.close')}
        onClick={onClose}
        className="absolute right-5 top-5 text-3xl leading-none text-mist transition-colors hover:text-gold"
      >
        ×
      </button>
      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label={t('media.previous')}
            onClick={(e) => {
              e.stopPropagation()
              onStep(-1)
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-4xl text-mist transition-colors hover:text-gold"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={t('media.next')}
            onClick={(e) => {
              e.stopPropagation()
              onStep(1)
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-4xl text-mist transition-colors hover:text-gold"
          >
            ›
          </button>
        </>
      )}
    </motion.div>
  )
}