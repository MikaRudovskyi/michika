import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SiteCard from '../components/SiteCard'
import SiteDialog from '../components/SiteDialog'
import { useLang } from '../hooks/useLang'
import { api } from '../lib/api'
import { formatYen } from '../lib/format'
import { mediaApi } from '../lib/mediaApi'
import { stagger } from '../lib/motion'
import type { SiteItem, SiteType, SortKey } from '../lib/types'

const TYPES: SiteType[] = ['temple', 'castle', 'garden', 'museum', 'historical_site', 'tea_ceremony']
const SORTS: SortKey[] = ['popularity', 'fee', 'duration']
const FEE_MAX = 5000
const DURATION_MAX = 180

export default function Discover() {
  const { t } = useTranslation()
  const lang = useLang()
  const [type, setType] = useState<SiteType | undefined>()
  const [fee, setFee] = useState(FEE_MAX)
  const [duration, setDuration] = useState(DURATION_MAX)
  const [sort, setSort] = useState<SortKey>('popularity')
  const [selected, setSelected] = useState<SiteItem | null>(null)

  const filters = {
    type,
    maxFee: fee < FEE_MAX ? fee : undefined,
    maxDuration: duration < DURATION_MAX ? duration : undefined,
    sort,
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sites', filters, lang],
    queryFn: () => api.sites(filters, lang),
  })

  // One request for the cover photos of everything on the page.
  const ids = useMemo(() => (data?.items ?? []).map((s) => s.id), [data])
  const covers = useQuery({
    queryKey: ['covers', 'site', ids.join(',')],
    queryFn: () => mediaApi.covers('site', ids),
    enabled: ids.length > 0,
  })

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24">
      <header className="py-12">
        <p className="eyebrow mb-4">{t('discover.subtitle')}</p>
        <h1 className="text-4xl sm:text-5xl">{t('discover.title')}</h1>
      </header>

      <div className="glass p-6 mb-10 grid gap-8 lg:grid-cols-[1.4fr_1fr_1fr_auto] items-end">
        <div>
          <p className="text-xs text-mist mb-3">{t('discover.type')}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setType(undefined)} className={clsx('chip', !type && 'chip-active')}>
              {t('discover.all')}
            </button>
            {TYPES.map((k) => (
              <button
                key={k}
                onClick={() => setType(k)}
                className={clsx('chip', type === k && 'chip-active')}
              >
                {t(`types.${k}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-mist mb-3 flex justify-between">
            <span>{t('discover.maxFee')}</span>
            <span className="text-washi">{fee >= FEE_MAX ? t('discover.any') : formatYen(fee)}</span>
          </p>
          <input type="range" min={0} max={FEE_MAX} step={100} value={fee} onChange={(e) => setFee(+e.target.value)} />
        </div>

        <div>
          <p className="text-xs text-mist mb-3 flex justify-between">
            <span>{t('discover.maxDuration')}</span>
            <span className="text-washi">
              {duration >= DURATION_MAX ? t('discover.any') : t('card.min', { count: duration })}
            </span>
          </p>
          <input
            type="range"
            min={30}
            max={DURATION_MAX}
            step={15}
            value={duration}
            onChange={(e) => setDuration(+e.target.value)}
          />
        </div>

        <div>
          <p className="text-xs text-mist mb-3">{t('discover.sort')}</p>
          <select className="input !py-2" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((s) => (
              <option key={s} value={s} className="bg-charcoal">
                {t(`sort.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p className="text-mist">{t('common.loading')}</p>}
      {isError && <p className="text-red-300/80">{t('common.error')}</p>}

      {data && (
        <>
          <p className="text-xs text-mist mb-6">{t('discover.results', { count: data.total })}</p>
          {data.items.length === 0 ? (
            <p className="text-mist">{t('discover.empty')}</p>
          ) : (
            <motion.div
              key={JSON.stringify(filters) + lang}
              variants={stagger}
              initial="hidden"
              animate="show"
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {data.items.map((s) => (
                <SiteCard
                  key={s.id}
                  site={s}
                  cover={covers.data?.[s.id]?.cover}
                  count={covers.data?.[s.id]?.count}
                  onOpen={() => setSelected(s)}
                />
              ))}
            </motion.div>
          )}
        </>
      )}

      {selected && <SiteDialog site={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}