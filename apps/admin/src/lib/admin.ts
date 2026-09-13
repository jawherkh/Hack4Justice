import type { AdminRole, SubmissionStatus } from '@hack4justice/shared'
import { api, unwrap } from '#/lib/api'

const admin = () => api.api.admin

export const adminKeys = {
  stats: ['admin', 'stats'] as const,
  users: (search: string) => ['admin', 'users', search] as const,
  user: (id: string) => ['admin', 'users', id] as const,
  submissions: (status: string, search: string) => ['admin', 'submissions', status, search] as const,
  submission: (id: string) => ['admin', 'submissions', id] as const,
  staff: ['admin', 'staff'] as const,
}

export type StatsView = Awaited<ReturnType<typeof getStats>>
export type UserRow = Awaited<ReturnType<typeof listUsers>>[number]
export type UserDetail = Awaited<ReturnType<typeof getUser>>
export type SubmissionRow = Awaited<ReturnType<typeof listSubmissions>>[number]
export type SubmissionDetail = Awaited<ReturnType<typeof getSubmission>>
export type StaffRow = Awaited<ReturnType<typeof listStaff>>[number]

export async function getStats() {
  return unwrap(await admin().stats.get(), 'Could not load stats')
}
export async function listUsers(search: string) {
  return unwrap(await admin().users.get({ query: search ? { search } : {} }), 'Could not load users')
}
export async function getUser(id: string) {
  return unwrap(await admin().users({ id }).get(), 'Could not load user')
}
export async function listSubmissions(status: string, search: string) {
  return unwrap(
    await admin().submissions.get({
      query: { ...(status ? { status } : {}), ...(search ? { search } : {}) },
    }),
    'Could not load submissions',
  )
}
export async function getSubmission(id: string) {
  return unwrap(await admin().submissions({ id }).get(), 'Could not load submission')
}
export async function reviewSubmission(id: string, input: { status: SubmissionStatus; note?: string }) {
  return unwrap(await admin().submissions({ id }).review.patch(input), 'Could not update submission')
}
export async function listStaff() {
  return unwrap(await admin().staff.get(), 'Could not load staff')
}
export async function createStaff(input: { name: string; email: string; password: string; role: AdminRole }) {
  return unwrap(await admin().staff.post(input), 'Could not create staff account')
}
export async function updateStaff(id: string, input: { name?: string; role?: AdminRole }) {
  return unwrap(await admin().staff({ id }).patch(input), 'Could not update staff account')
}
export async function deleteStaff(id: string) {
  unwrap(await admin().staff({ id }).delete(), 'Could not delete staff account')
}
