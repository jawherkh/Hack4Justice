import { api } from '#/lib/api'
import { unwrap } from '#/lib/api-error'

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export const OCR_LANGUAGES = ['fra+eng', 'fra', 'eng', 'ara+fra'] as const
export type OcrLanguages = (typeof OCR_LANGUAGES)[number]

export type UploadSummary = Awaited<ReturnType<typeof listUploads>>[number]
export type UploadDetail = Awaited<ReturnType<typeof getUpload>>

export async function listUploads() {
  return unwrap(await api.api.v1.uploads.get(), 'Could not load uploads')
}

export async function getUpload(id: string) {
  return unwrap(await api.api.v1.uploads({ id }).get(), 'Could not load upload')
}

export async function uploadPdf(input: { file: File; languages: OcrLanguages }) {
  return unwrap(await api.api.v1.uploads.post(input), 'Upload failed')
}

export async function deleteUpload(id: string) {
  unwrap(await api.api.v1.uploads({ id }).delete(), 'Delete failed')
}

export async function retryExtraction(input: { id: string; languages?: OcrLanguages }) {
  return unwrap(
    await api.api.v1
      .uploads({ id: input.id })
      .extract.post(input.languages ? { languages: input.languages } : {}),
    'Retry failed',
  )
}

/** Poll while an upload is still being processed. */
export function pollingInterval(statuses: string[]): number | false {
  return statuses.includes('PROCESSING') ? 2000 : false
}
