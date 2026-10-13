import clsx from 'clsx'
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAP_STYLE } from '../lib/maplibreSetup'
import './map/map.css'

interface Props {
  lngLat: [number, number]
  className?: string // give it an absolute or sized box: the map fills its parent
}

/** The surroundings in 3D: buildings come from the vector tiles already used by the map style,
 *  and the camera slowly circles the spot until the visitor takes over. */
export default function NeighborhoodPreview({ lngLat, className }: Props) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const playingRef = useRef(playing)
  const [failed, setFailed] = useState(false)
  const [lng, lat] = lngLat

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    const el = container.current
    if (!el) return

    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: el,
        style: MAP_STYLE,
        center: [lng, lat],
        zoom: 16.4,
        pitch: 62,
        bearing: -25,
        maxPitch: 75,
        cooperativeGestures: true,
        locale: {
          'CooperativeGesturesHandler.WindowsHelpText': t('map.gestureWin'),
          'CooperativeGesturesHandler.MacHelpText': t('map.gestureMac'),
          'CooperativeGesturesHandler.MobileHelpText': t('map.gestureMobile'),
        },
      })
    } catch {
      setFailed(true) // e.g. WebGL is unavailable
      return
    }
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')

    const wrap = document.createElement('div')
    wrap.className = 'michika-stay-wrap'
    const diamond = document.createElement('div')
    diamond.className = 'michika-stay michika-stay--rec'
    wrap.appendChild(diamond)
    new Marker({ element: wrap, anchor: 'center' }).setLngLat([lng, lat]).addTo(map)

    map.on('load', () => {
      const style = map.getStyle()
      const vectorSource = Object.entries(style.sources).find(([, source]) => source.type === 'vector')?.[0]
      if (!vectorSource) return
      const firstLabel = style.layers.find((layer) => layer.type === 'symbol')?.id
      // OpenMapTiles schema: heights are optional in the data, so unknown buildings get 6 m.
      map.addLayer(
        {
          id: 'michika-3d-buildings',
          type: 'fill-extrusion',
          source: vectorSource,
          'source-layer': 'building',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#34343b',
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.88,
          },
        },
        firstLabel,
      )
    })

    // Slow orbit; touching the map stops it.
    const stop = () => setPlaying(false)
    map.on('mousedown', stop)
    map.on('touchstart', stop)
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      if (playingRef.current) map.setBearing(map.getBearing() + (now - last) * 0.004)
      last = now
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    const observer = new ResizeObserver(() => map.resize())
    observer.observe(el)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      map.remove()
    }
  }, [lng, lat, t])

  return (
    <div className={clsx('relative', className)}>
      <div ref={container} className="h-full w-full" />
      {failed ? (
        <div className="absolute inset-0 grid place-items-center bg-charcoal text-sm text-mist">{t('map.failed')}</div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="absolute bottom-3 left-3 rounded-full bg-sumi/70 px-4 py-1.5 text-xs text-washi backdrop-blur transition-colors hover:text-gold"
          >
            {playing ? t('media.pause') : t('media.rotate')}
          </button>
          <p className="pointer-events-none absolute left-3 top-3 hidden max-w-[16rem] text-[11px] text-mist/80 sm:block">
            {t('media.areaHint')}
          </p>
        </>
      )}
    </div>
  )
}