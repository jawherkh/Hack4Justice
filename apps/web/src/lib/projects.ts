import type { ProjectDestination, SubmissionStatus } from '@hack4justice/shared'
import { api } from '#/lib/api'
import { unwrap } from '#/lib/api-error'
import { uploadPdf } from '#/lib/uploads'

export type ProjectSummary = Awaited<ReturnType<typeof listProjects>>[number]
export type ProjectDetail = Awaited<ReturnType<typeof getProject>>
export type ProjectRequirementView = ProjectDetail['requirements'][number]
export type ProjectUpload = Awaited<ReturnType<typeof listProjectUploads>>[number]

export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
  uploads: (id: string) => ['projects', id, 'uploads'] as const,
}

export async function listProjects() {
  return unwrap(await api.api.v1.projects.get(), 'Could not load projects')
}

export async function getProject(id: string) {
  return unwrap(await api.api.v1.projects({ id }).get(), 'Could not load project')
}

export async function createProject(input: {
  name: string
  destination: ProjectDestination
  description?: string
}) {
  return unwrap(await api.api.v1.projects.post(input), 'Could not create project')
}

export async function deleteProject(id: string) {
  unwrap(await api.api.v1.projects({ id }).delete(), 'Delete failed')
}

export async function onboardProject(id: string, input: { serviceId: string; waived: string[] }) {
  return unwrap(await api.api.v1.projects({ id }).onboarding.post(input), 'Could not set up the procedure')
}

export interface RequirementPatch {
  status?: string
  value?: Record<string, string>
  uploadId?: string | null
  note?: string
}

export async function updateRequirement(id: string, requirementId: string, patch: RequirementPatch) {
  return unwrap(
    await api.api.v1.projects({ id }).requirements({ requirementId }).put(patch),
    'Could not update requirement',
  )
}

/** Upload a PDF into the project and attach it to a document requirement in one go. */
export async function uploadAndAttach(projectId: string, requirementId: string, file: File) {
  const upload = await uploadPdf({ file, languages: 'fra+eng', projectId })
  return updateRequirement(projectId, requirementId, { uploadId: upload.id })
}

export async function setSubmissionStatus(id: string, status: SubmissionStatus | null) {
  return unwrap(await api.api.v1.projects({ id }).submission.patch({ status }), 'Could not update status')
}

export async function listProjectUploads(id: string) {
  return unwrap(await api.api.v1.projects({ id }).uploads.get(), 'Could not load files')
}

export interface ProjectFilters {
  query?: string
  destination?: ProjectDestination
}

/**
 * Client-side filtering: a user's project list is small, so filtering locally
 * keeps search instant and lets us highlight matches without a round trip.
 */
export function filterProjects<T extends { name: string; description: string | null; destination: string }>(
  projects: readonly T[],
  { query, destination }: ProjectFilters,
): T[] {
  const needle = query?.trim().toLowerCase() ?? ''
  return projects.filter((project) => {
    if (destination && project.destination !== destination) return false
    if (!needle) return true
    return (
      project.name.toLowerCase().includes(needle) ||
      (project.description?.toLowerCase().includes(needle) ?? false)
    )
  })
}

export function countByDestination<T extends { destination: string }>(projects: readonly T[]) {
  const counts: Record<string, number> = {}
  for (const project of projects) counts[project.destination] = (counts[project.destination] ?? 0) + 1
  return counts
}

export type ProjectSubmission = ProjectDetail['submissions'][number]

/** Records the official submission; requires every requirement to be valid. */
export async function submitProject(id: string, input: { receipt?: string; note?: string }) {
  return unwrap(await api.api.v1.projects({ id }).submissions.post(input), 'Could not record the submission')
}

/** Downloads the cover sheet or the full dossier of a submission through the API (cookie auth). */
export async function exportSubmission(
  projectId: string,
  submissionId: string,
  format: 'pdf' | 'zip',
  labels: Record<string, string>,
) {
  const baseUrl = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001'
  const response = await fetch(`${baseUrl}/api/v1/projects/${projectId}/submissions/${submissionId}/export`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, labels }),
  })
  if (!response.ok) throw new Error(`Export failed (${response.status})`)
  const disposition = response.headers.get('content-disposition') ?? ''
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition)
  const filename = match?.[1] ? decodeURIComponent(match[1]) : `submission.${format}`
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
