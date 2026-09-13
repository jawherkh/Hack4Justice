import type { ProjectDestination } from '@hack4justice/shared'
import { api } from '#/lib/api'
import { unwrap } from '#/lib/api-error'

export type ProjectSummary = Awaited<ReturnType<typeof listProjects>>[number]
export type ProjectDetail = Awaited<ReturnType<typeof getProject>>

export const projectKeys = {
  all: ['projects'] as const,
  detail: (id: string) => ['projects', id] as const,
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
