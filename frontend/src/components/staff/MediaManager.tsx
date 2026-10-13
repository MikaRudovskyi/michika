import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { mediaApi } from '../../lib/mediaApi'
import type { MediaImage, MediaKind } from '../../lib/mediaApi'
import type { I18nText } from '../../lib/types.staff'
import ResponsiveImage from '../ResponsiveImage'
import Modal from './Modal'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const MAX_MB = 8
const MAX_IMAGES = 24
const MAX_PER_BATCH = 10

interface Props {
  kind: MediaKind
  entityId: string
  title: string
  onClose: () => void
}

export default function MediaManager({ kind, entityId, title, onClose }: Props) {
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const list = useQuery({ queryKey: ['media', kind, entityId], queryFn: () => mediaApi.list(kind, entityId) })
  const images = list.data ?? []

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['media', kind, entityId] })
    qc.invalidateQueries({ queryKey: ['covers'] })
  }

  const upload = useMutation({
    mutationFn: (files: File[]) => mediaApi.upload(kind, entityId, files),
    onSuccess: (res) => {
      setProblems((prev) => [...prev, ...res.errors.map((e) => `${e.filename}: ${e.message}`)])
      refresh()
    },
  })
  const reorder = useMutation({ mutationFn: (ids: string[]) => mediaApi.reorder(kind, entityId, ids), onSuccess: refresh })
  const remove = useMutation({
    mutationFn: (id: string) => mediaApi.remove(id),
    onSuccess: () => {
      setConfirmId(null)
      refresh()
    },
  })
  const saveAlt = useMutation({
    mutationFn: ({ id, alt }: { id: string; alt: I18nText | null }) => mediaApi.setAlt(id, alt),
    onSuccess: refresh,
  })

  // A delete button asks twice: the second click, within four seconds, confirms.
  useEffect(() => {
    if (!confirmId) return
    const timer = setTimeout(() => setConfirmId(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmId])

  const pick = (picked: FileList | File[]) => {
    const issues: string[] = []
    const valid = Array.from(picked).filter((file) => {
      if (!ACCEPTED.includes(file.type)) {
        issues.push(`${file.name}: only JPEG, PNG and WebP images are accepted.`)
        return false
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        issues.push(`${file.name}: larger than ${MAX_MB} MB.`)
        return false
      }
      return true
    })
    const room = Math.max(0, MAX_IMAGES - images.length)
    if (valid.length > Math.min(room, MAX_PER_BATCH)) {
      issues.push(`Only ${Math.min(room, MAX_PER_BATCH)} more photo(s) can be added now (limit ${MAX_IMAGES}, ${MAX_PER_BATCH} at a time).`)
    }
    setProblems(issues)
    const batch = valid.slice(0, Math.min(room, MAX_PER_BATCH))
    if (batch.length > 0) upload.mutate(batch)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return
    const ids = images.map((i) => i.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    reorder.mutate(ids)
  }

  const busy = upload.isPending || reorder.isPending || remove.isPending
  const failure = (upload.error ?? reorder.error ?? remove.error ?? saveAlt.error) as Error | null

  return (
    <Modal title={`Photos: ${title}`} onClose={onClose} wide>
      <div className="flex flex-col gap-6">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            pick(e.dataTransfer.files)
          }}
          className={clsx(
            'rounded-xl border border-dashed p-6 text-center transition-colors duration-500',
            dragging ? 'border-gold bg-gold/5' : 'border-white/20',
          )}
        >
          <p className="text-sm text-mist">Drag photos here, or</p>
          <button type="button" className="btn btn-ghost mt-3" disabled={busy} onClick={() => input.current?.click()}>
            {upload.isPending ? 'Uploading…' : 'Choose files'}
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPTED.join(',')}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) pick(e.target.files)
              e.target.value = ''
            }}
          />
          <p className="mt-3 text-[11px] text-mist/70">
            JPEG, PNG or WebP · at least 400 px wide · up to {MAX_MB} MB each · {images.length}/{MAX_IMAGES} used. Only
            upload photos you own or may use.
          </p>
        </div>

        {problems.length > 0 && (
          <ul className="list-inside list-disc space-y-1 text-xs text-amber-200/90">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {failure && <p className="text-sm text-red-300/80">{failure.message}</p>}
        {list.isLoading && <p className="text-sm text-mist">Loading…</p>}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image, i) => (
            <div key={image.id} className="flex flex-col gap-3 rounded-xl border border-white/10 p-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg">
                <ResponsiveImage image={image} sizes="260px" fallbackAlt="" className="h-full w-full" />
                {i === 0 && (
                  <span className="absolute left-2 top-2 rounded-full bg-gold px-2.5 py-0.5 text-[11px] font-medium text-sumi">
                    Cover
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="btn btn-ghost !py-1 !px-3 text-xs" disabled={busy || i === 0} onClick={() => move(i, i - 1)} aria-label="Move earlier">
                  ←
                </button>
                <button className="btn btn-ghost !py-1 !px-3 text-xs" disabled={busy || i === images.length - 1} onClick={() => move(i, i + 1)} aria-label="Move later">
                  →
                </button>
                {i > 0 && (
                  <button className="btn btn-ghost !py-1 !px-3 text-xs" disabled={busy} onClick={() => move(i, 0)}>
                    Make cover
                  </button>
                )}
                <button
                  className={clsx(
                    'btn btn-ghost !py-1 !px-3 text-xs ml-auto',
                    confirmId === image.id ? '!border-red-300/60 !text-red-300' : '!text-red-300/80',
                  )}
                  disabled={busy}
                  onClick={() => (confirmId === image.id ? remove.mutate(image.id) : setConfirmId(image.id))}
                >
                  {confirmId === image.id ? 'Sure?' : 'Delete'}
                </button>
              </div>

              <AltFields image={image} pending={saveAlt.isPending} onSave={(alt) => saveAlt.mutate({ id: image.id, alt })} />
            </div>
          ))}
        </div>

        {list.data && images.length === 0 && <p className="text-center text-sm text-mist">No photos yet.</p>}
      </div>
    </Modal>
  )
}

function AltFields({
  image,
  pending,
  onSave,
}: {
  image: MediaImage
  pending: boolean
  onSave: (alt: I18nText | null) => void
}) {
  const saved = { en: image.alt?.en ?? '', uk: image.alt?.uk ?? '', ja: image.alt?.ja ?? '' }
  const [alt, setAlt] = useState(saved)
  const dirty = alt.en !== saved.en || alt.uk !== saved.uk || alt.ja !== saved.ja

  return (
    <details className="text-xs text-mist">
      <summary className="cursor-pointer transition-colors hover:text-gold">Alt text (for screen readers)</summary>
      <div className="mt-3 flex flex-col gap-2">
        {(['en', 'uk', 'ja'] as const).map((lang) => (
          <input
            key={lang}
            className="input !py-2 !text-xs"
            maxLength={200}
            placeholder={`Describe the photo (${lang.toUpperCase()})`}
            value={alt[lang]}
            onChange={(e) => setAlt((prev) => ({ ...prev, [lang]: e.target.value }))}
          />
        ))}
        <p className="text-[11px] text-mist/70">English is required. Leave it empty to remove the text.</p>
        <button
          className="btn btn-ghost !py-1.5 !px-4 self-start text-xs"
          disabled={!dirty || pending}
          onClick={() =>
            onSave(
              alt.en.trim()
                ? { en: alt.en.trim(), uk: alt.uk.trim() || null, ja: alt.ja.trim() || null }
                : null,
            )
          }
        >
          Save
        </button>
      </div>
    </details>
  )
}