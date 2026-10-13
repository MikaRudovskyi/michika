import clsx from 'clsx'
import { useState } from 'react'
import { useLang } from '../hooks/useLang'
import type { MediaImage } from '../lib/mediaApi'
import type { Lang } from '../lib/types'

export function pickAlt(image: MediaImage, lang: Lang, fallback: string): string {
  return image.alt?.[lang] || image.alt?.en || fallback
}

interface Props {
  image: MediaImage
  sizes: string // what the layout needs, e.g. "(min-width: 768px) 720px, 92vw"
  fallbackAlt: string
  className?: string // the parent decides the box: give it a height or an aspect ratio
  fit?: 'cover' | 'contain'
}

/** The browser picks the smallest file that is sharp enough; the photo's average colour
 *  shows while it loads, then the image fades in. */
export default function ResponsiveImage({ image, sizes, fallbackAlt, className, fit = 'cover' }: Props) {
  const lang = useLang()
  const [loaded, setLoaded] = useState(false)
  const widths = Object.keys(image.files)
    .map(Number)
    .sort((a, b) => a - b)
  const srcSet = widths.map((w) => `${image.files[String(w)]} ${w}w`).join(', ')
  const src = image.files[String(widths[Math.min(1, widths.length - 1)])]

  return (
    <div
      className={clsx('relative overflow-hidden', className)}
      style={fit === 'cover' ? { backgroundColor: image.color } : undefined}
    >
      <img
        ref={(el) => {
          if (el?.complete) setLoaded(true) // already in the browser cache
        }}
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={pickAlt(image, lang, fallbackAlt)}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={clsx(
          'absolute inset-0 h-full w-full transition-opacity duration-700 ease-calm',
          fit === 'cover' ? 'object-cover' : 'object-contain',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}