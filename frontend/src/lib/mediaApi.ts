import { query, request } from './http'
import type { I18nText } from './types.staff'

export type MediaKind = 'site' | 'accommodation'

export interface MediaImage {
  id: string
  width: number
  height: number
  color: string // average colour, shown while the photo loads
  alt: I18nText | null
  position: number
  files: Record<string, string> // width in pixels -> URL
}

export interface Cover {
  cover: MediaImage | null
  count: number
}

export interface UploadResult {
  items: MediaImage[]
  errors: { filename: string; message: string }[]
}

export const mediaApi = {
  covers(kind: MediaKind, ids: string[]) {
    return request<Record<string, Cover>>(`/media/covers${query({ kind, ids: ids.join(',') })}`)
  },

  list(kind: MediaKind, id: string) {
    return request<MediaImage[]>(`/media/${kind}/${id}`)
  },

  upload(kind: MediaKind, id: string, files: File[]) {
    const data = new FormData()
    for (const file of files) data.append('files', file)
    return request<UploadResult>(`/media/${kind}/${id}`, { method: 'POST', data })
  },

  reorder(kind: MediaKind, id: string, ids: string[]) {
    return request<MediaImage[]>(`/media/${kind}/${id}/order`, { method: 'PUT', json: { ids } })
  },

  setAlt(imageId: string, alt: I18nText | null) {
    return request<MediaImage>(`/media/item/${imageId}`, { method: 'PATCH', json: { alt } })
  },

  remove(imageId: string) {
    return request<void>(`/media/item/${imageId}`, { method: 'DELETE' })
  },
}