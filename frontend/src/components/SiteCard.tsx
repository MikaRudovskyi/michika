import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import logo from '../assets/michika-bg-1000.png'
import { formatYen } from '../lib/format'
import type { MediaImage } from '../lib/mediaApi'
import { rise } from '../lib/motion'
import type { SiteItem } from '../lib/types'
import ResponsiveImage from './ResponsiveImage'

interface Props {
  site: SiteItem
  cover?: MediaImage | null
  count?: number
  onOpen: () => void
}

export default function SiteCard({ site, cover, count = 0, onOpen }: Props) {
  const { t } = useTranslation()
  return (
    <motion.article
      variants={rise}
      whileHover={{ y: -4 }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="glass group flex cursor-pointer flex-col overflow-hidden outline-none transition-colors duration-500 ease-calm hover:border-gold/40 focus-visible:border-gold"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-charcoal">
        {cover ? (
          <ResponsiveImage
            image={cover}
            sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 92vw"
            fallbackAlt={site.name}
            className="h-full w-full transition-transform duration-[1200ms] ease-calm group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <img src={logo} alt="" className="w-1/2 select-none opacity-15" draggable={false} />
          </div>
        )}
        {count > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-sumi/70 px-2.5 py-0.5 text-[11px] text-washi backdrop-blur">
            {count} {t('media.photos').toLowerCase()}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <span className="eyebrow !tracking-[0.2em]">{t(`types.${site.type}`)}</span>
          <span className="text-xs text-mist">
            {site.fee_jpy === 0 ? t('card.free') : formatYen(site.fee_jpy)}
          </span>
        </div>

        <h3 className="text-2xl leading-snug">{site.name}</h3>

        <div className="flex flex-wrap gap-2">
          {site.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-mist">
              {t(`tag.${tag}`, { defaultValue: tag })}
            </span>
          ))}
        </div>

        <div className="mt-auto pt-2">
          <div className="mb-2 flex items-center justify-between text-xs text-mist">
            <span>{t('card.min', { count: site.avg_duration_min })}</span>
            <span>{t('card.popularity')}</span>
          </div>
          <div className="relative h-px overflow-hidden bg-white/10">
            <motion.div
              className="absolute inset-y-0 left-0 bg-gold"
              initial={{ width: 0 }}
              whileInView={{ width: `${Math.round(site.popularity * 100)}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
      </div>
    </motion.article>
  )
}