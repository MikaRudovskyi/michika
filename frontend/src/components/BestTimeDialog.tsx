import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { useLang } from '../hooks/useLang'
import { dateLocale } from '../lib/format'
import { insightsApi } from '../lib/insightsApi'
import Modal from './staff/Modal'

interface Props {
  siteId: string
  name: string
  onClose: () => void
}

export default function BestTimeDialog({ siteId, name, onClose }: Props) {
  const { t } = useTranslation()
  const lang = useLang()
  const locale = dateLocale(lang)

  const data = useQuery({
    queryKey: ['insight', 'best-time', siteId, lang],
    queryFn: () => insightsApi.bestTime(siteId, lang),
  })

  const monthName = (m: number) => new Date(2026, m - 1, 1).toLocaleDateString(locale, { month: 'short' })
  const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`

  return (
    <Modal title={`${t('smart.dialog.title')}: ${name}`} onClose={onClose} wide>
      {data.isLoading && <p className="text-sm text-mist">{t('common.loading')}</p>}
      {data.isError && <p className="text-sm text-red-300/80">{(data.error as Error).message}</p>}

      {data.data && (
        <div className="flex flex-col gap-8">
          <div>
            <p className="text-xs text-mist mb-4">{t('smart.dialog.months')}</p>
            <div className="flex items-end gap-2 h-40">
              {data.data.months.map((m) => {
                const best = data.data.best_months.includes(m.month)
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <div
                      title={`${monthName(m.month)}: ${Math.round(m.score * 100)}`}
                      className={clsx(
                        'w-full rounded-t-md transition-all duration-700 ease-calm',
                        best ? 'bg-gold' : 'bg-white/20',
                      )}
                      style={{ height: `${Math.max(6, Math.round(m.score * 100))}%` }}
                    />
                    <span className={clsx('text-[11px]', best ? 'text-gold' : 'text-mist')}>{monthName(m.month)}</span>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-mist/80 mt-4">{t('smart.dialog.hint')}</p>
          </div>

          <div>
            <p className="text-xs text-mist mb-3">{t('smart.dialog.hours')}</p>
            <div className="flex flex-wrap gap-2">
              {data.data.best_hours.map((h) => (
                <span key={h.hour} className="chip chip-active cursor-default">
                  {hourLabel(h.hour)}
                </span>
              ))}
            </div>
          </div>

          <div className="text-[11px] text-mist/80 space-y-1">
            {data.data.indoor && <p>{t('smart.dialog.indoor')}</p>}
            <p>{data.data.climate_source === 'archive' ? t('smart.dialog.archive') : t('smart.dialog.approx')}</p>
          </div>
        </div>
      )}
    </Modal>
  )
}