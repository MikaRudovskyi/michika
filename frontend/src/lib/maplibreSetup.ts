// Import this module before creating a MapLibre map outside the route map (which does the same itself).
import { setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// MapLibre 6 needs its worker URL from the bundler; Vite's `?worker&url` provides it.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)

// OpenFreeMap needs no API key. Override with VITE_MAP_STYLE (any MapLibre style URL).
export const MAP_STYLE =
  (import.meta.env.VITE_MAP_STYLE as string | undefined) || 'https://tiles.openfreemap.org/styles/dark'