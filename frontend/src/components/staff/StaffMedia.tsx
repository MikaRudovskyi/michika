import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { useState } from 'react'
import logo from '../../assets/michika-bg-1000.png'
import MediaManager from '../../components/staff/MediaManager'
import ResponsiveImage from '../../components/ResponsiveImage'
import { staffApi } from '../../lib/api'
import { mediaApi } from '../../lib/mediaApi'
import type { MediaKind } from '../../lib/mediaApi'

export default function StaffMedia() {
  const [kind, setKind] = useState<MediaKind>('site')
  const [managing, setManaging] = useState<{ id: string; title: string } | null>(null)

  // Same query keys as the Cultural sites and Properties pages, so the data is shared.
  const sites = useQuery({
    queryKey: ['staff', 'sites', '', ''],
    queryFn: () => staffApi.sites({}),
    enabled: kind === 'site',
  })
  const properties = useQuery({
    queryKey: ['staff', 'accommodations'],
    queryFn: staffApi.accommodations,
    enabled: kind === 'accommodation',
  })

  const rows =
    kind === 'site'
      ? (sites.data?.items ?? []).map((s) => ({ id: s.id, title: s.name.en, subtitle: s.slug }))
      : (properties.data ?? []).map((a) => ({ id: a.id, title: a.name.en, subtitle: a.owner_email ?? a.type }))
  const ids = rows.map((r) => r.id)

  const covers = useQuery({
    queryKey: ['covers', kind, ids.join(',')],
    queryFn: () => mediaApi.covers(kind, ids),
    enabled: ids.length > 0,
  })

  const loading = kind === 'site' ? sites.isLoading : properties.isLoading
  const error = (kind === 'site' ? sites.error : properties.error) as Error | null

  return (
    <div>
      <div className="mb-8 flex flex-wrap gap-2">
        <button className={clsx('chip', kind === 'site' && 'chip-active')} onClick={() => setKind('site')}>
          Cultural sites
        </button>
        <button
          className={clsx('chip', kind === 'accommodation' && 'chip-active')}
          onClick={() => setKind('accommodation')}
        >
          Properties
        </button>
      </div>

      {loading && <p className="text-mist">Loading…</p>}
      {error && <p className="text-red-300/80">{error.message}</p>}

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const info = covers.data?.[row.id]
          return (
            <div key={row.id} className="glass flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
              <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-charcoal">
                {info?.cover ? (
                  <ResponsiveImage image={info.cover} sizes="80px" fallbackAlt="" className="h-full w-full" />
                ) : (
                  <span className="grid h-full w-full place-items-center">
                    <img src={logo} alt="" className="h-10 opacity-20" draggable={false} />
                  </span>
                )}
              </div>

              <div className="min-w-[12rem] flex-1">
                <p className="font-serif text-lg leading-snug">{row.title}</p>
                <p className="mt-1 text-xs text-mist">{row.subtitle}</p>
              </div>

              <p className="text-xs text-mist">
                {info?.count ? `${info.count} photo${info.count === 1 ? '' : 's'}` : 'No photos'}
              </p>

              <button
                className="btn btn-ghost !py-1.5 !px-4 text-xs"
                onClick={() => setManaging({ id: row.id, title: row.title })}
              >
                Manage photos
              </button>
            </div>
          )
        })}
        {!loading && rows.length === 0 && (
          <div className="glass p-10 text-center text-sm text-mist">Nothing to show here yet.</div>
        )}
      </div>

      {managing && (
        <MediaManager
          kind={kind}
          entityId={managing.id}
          title={managing.title}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  )
}