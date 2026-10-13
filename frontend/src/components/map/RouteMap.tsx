import clsx from 'clsx'
import { Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl } from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 ships its worker as a separate module that bundlers cannot discover on their own.
// Vite's `?worker&url` bundles it into a self-contained file and gives us the URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EMPTY_LINES, boundsOf, buildRoute, dayColor } from '../../lib/mapGeo'
import type { Focus, MapStay, MapStop, SegmentProps } from '../../lib/mapGeo'
import './map.css'

setWorkerUrl(workerUrl)

// OpenFreeMap needs no API key. Override with VITE_MAP_STYLE (any MapLibre style URL).
const STYLE =
  (import.meta.env.VITE_MAP_STYLE as string | undefined) || 'https://tiles.openfreemap.org/styles/dark'
const DEFAULT_CENTER: [number, number] = [135.76, 35.0]
const LOAD_TIMEOUT_MS = 15_000

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const ms = (n: number) => (reducedMotion() ? 0 : n)

// Popups are built from DOM nodes with textContent, never innerHTML: names come from the database.
function popupContent(title: string, lines: string[]): HTMLElement {
  const root = document.createElement('div')
  const heading = document.createElement('p')
  heading.className = 'michika-popup-title'
  heading.textContent = title
  root.appendChild(heading)
  for (const line of lines) {
    const p = document.createElement('p')
    p.className = 'michika-popup-line'
    p.textContent = line
    root.appendChild(p)
  }
  return root
}

function pinElement(stop: MapStop): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'michika-pin-wrap'
  const pin = document.createElement('div')
  pin.className = 'michika-pin'
  pin.style.backgroundColor = dayColor(stop.day)
  pin.textContent = String(stop.order)
  pin.setAttribute('role', 'img')
  pin.setAttribute('aria-label', stop.title)
  wrap.appendChild(pin)
  return wrap
}

function stayElement(stay: MapStay): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'michika-stay-wrap'
  const diamond = document.createElement('div')
  diamond.className = stay.recommended ? 'michika-stay michika-stay--rec' : 'michika-stay'
  diamond.setAttribute('role', 'img')
  diamond.setAttribute('aria-label', stay.title)
  wrap.appendChild(diamond)
  return wrap
}

interface Props {
  stops: MapStop[]
  stays: MapStay[]
  visibleDay: number | null
  showStays: boolean
  focus: Focus | null
  describeSegment: (props: SegmentProps) => { title: string; lines: string[] }
  className?: string
}

export default function RouteMap({
  stops,
  stays,
  visibleDay,
  showStays,
  focus,
  describeSegment,
  className,
}: Props) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const stopMarkers = useRef(new Map<string, Marker>())
  const stayMarkers = useRef<Marker[]>([])
  const describeRef = useRef(describeSegment)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<string | null>(null) // the technical reason

  // Handlers registered once read the latest callback through a ref.
  useEffect(() => {
    describeRef.current = describeSegment
  }, [describeSegment])

  // Create the map. Re-created when the UI language changes so the gesture hints are translated.
  useEffect(() => {
    const el = container.current
    if (!el) return

    let loaded = false
    let firstError = ''
    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: el,
        style: STYLE,
        center: DEFAULT_CENTER,
        zoom: 9,
        // The planner is a long page: require Ctrl + scroll (or two fingers) so the map does not hijack scrolling.
        cooperativeGestures: true,
        locale: {
          'CooperativeGesturesHandler.WindowsHelpText': t('map.gestureWin'),
          'CooperativeGesturesHandler.MacHelpText': t('map.gestureMac'),
          'CooperativeGesturesHandler.MobileHelpText': t('map.gestureMobile'),
        },
      })
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Could not start WebGL') // e.g. WebGL is unavailable
      return
    }
    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')

    map.on('error', (e) => {
      if (import.meta.env.DEV) console.error('[map]', e.error)
      if (!loaded && !firstError) firstError = e.error?.message ?? 'Unknown map error'
    })

    const timer = window.setTimeout(() => {
      if (!loaded) setFailed(firstError || 'Timed out waiting for the map to load')
    }, LOAD_TIMEOUT_MS)

    map.on('load', () => {
      loaded = true
      window.clearTimeout(timer)
      setFailed(null)

      map.addSource('route-links', { type: 'geojson', data: EMPTY_LINES })
      map.addSource('route-lines', { type: 'geojson', data: EMPTY_LINES })

      map.addLayer({
        id: 'route-links',
        type: 'line',
        source: 'route-links',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-dasharray': [2, 3], 'line-opacity': 0.7 },
      })
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0B0B0C', 'line-width': 7, 'line-opacity': 0.7 },
      })
      map.addLayer({
        id: 'route-lines',
        type: 'line',
        source: 'route-lines',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 3.5 },
      })
      // Wide invisible line: an easier click target for the transport popup.
      map.addLayer({
        id: 'route-hit',
        type: 'line',
        source: 'route-lines',
        paint: { 'line-color': '#000000', 'line-width': 18, 'line-opacity': 0 },
      })

      map.on('mouseenter', 'route-hit', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'route-hit', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', 'route-hit', (e) => {
        const props = e.features?.[0]?.properties as SegmentProps | undefined
        if (!props) return
        const info = describeRef.current(props)
        new Popup({ closeButton: false, offset: 8 })
          .setLngLat(e.lngLat)
          .setDOMContent(popupContent(info.title, info.lines))
          .addTo(map)
      })

      setReady(true)
    })

    const observer = new ResizeObserver(() => map.resize())
    observer.observe(el)

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
      stopMarkers.current.forEach((m) => m.remove())
      stopMarkers.current.clear()
      stayMarkers.current.forEach((m) => m.remove())
      stayMarkers.current = []
      map.remove()
      mapRef.current = null
      setReady(false)
      setFailed(null)
    }
  }, [t])

  // Route lines.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const { lines, links } = buildRoute(stops, visibleDay)
    const linesSource = map.getSource('route-lines') as GeoJSONSource | undefined
    const linksSource = map.getSource('route-links') as GeoJSONSource | undefined
    linesSource?.setData(lines)
    linksSource?.setData(links)
  }, [stops, visibleDay, ready])

  // Stop pins.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    stopMarkers.current.forEach((m) => m.remove())
    stopMarkers.current.clear()
    for (const stop of stops) {
      if (visibleDay !== null && stop.day !== visibleDay) continue
      const marker = new Marker({ element: pinElement(stop), anchor: 'center' })
        .setLngLat(stop.lngLat)
        .setPopup(
          new Popup({ offset: 18, closeButton: false, maxWidth: '260px' }).setDOMContent(
            popupContent(stop.title, stop.lines),
          ),
        )
        .addTo(map)
      stopMarkers.current.set(stop.id, marker)
    }
  }, [stops, visibleDay, ready])

  // Fit the view to what is visible.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const points = stops.filter((s) => visibleDay === null || s.day === visibleDay).map((s) => s.lngLat)
    const bounds = boundsOf(points)
    if (!bounds) return
    map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: ms(800) })
  }, [stops, visibleDay, ready])

  // Fly to a stop chosen in the timeline. Declared after the pin effect so the markers exist.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    stopMarkers.current.forEach((marker, id) => {
      marker.getElement().firstElementChild?.classList.toggle('is-focus', id === focus?.id)
    })
    if (!focus) return
    const marker = stopMarkers.current.get(focus.id)
    if (!marker) return
    map.flyTo({ center: marker.getLngLat(), zoom: Math.max(map.getZoom(), 14), duration: ms(1000) })
    if (!marker.getPopup()?.isOpen()) marker.togglePopup()
  }, [focus, ready])

  // Places to stay.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    stayMarkers.current.forEach((m) => m.remove())
    stayMarkers.current = []
    if (!showStays) return
    stayMarkers.current = stays.map((stay) =>
      new Marker({ element: stayElement(stay), anchor: 'center' })
        .setLngLat(stay.lngLat)
        .setPopup(
          new Popup({ offset: 16, closeButton: false, maxWidth: '260px' }).setDOMContent(
            popupContent(stay.title, stay.lines),
          ),
        )
        .addTo(map),
    )
  }, [stays, showStays, ready])

  return (
    <div className={clsx('relative', className)}>
      {/* MapLibre's own CSS sets `position: relative` on its container, which overrides a Tailwind
          `absolute` class and collapses the box to zero height. Size it from the parent instead. */}
      <div ref={container} className="h-full w-full" />
      {!ready && failed === null && (
        <div className="absolute inset-0 grid place-items-center bg-charcoal/60 text-xs text-mist pointer-events-none">
          {t('map.loading')}
        </div>
      )}
      {!ready && failed !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-charcoal px-6 text-center">
          <p className="text-sm text-mist">{t('map.failed')}</p>
          {import.meta.env.DEV && (
            <p className="max-w-lg break-words font-mono text-[11px] text-mist/70">{failed}</p>
          )}
        </div>
      )}
    </div>
  )
}