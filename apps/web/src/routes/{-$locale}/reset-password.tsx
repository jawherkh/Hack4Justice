import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ResetPasswordForm } from '#/components/auth/reset-password-form'
import { requireGuest } from '#/lib/guards'

// Better Auth lands here with `?token=` after verifying the emailed link,
// or with `?error=INVALID_TOKEN` when the link is bad or expired.
const searchSchema = z.object({
  token: z.string().optional(),
  error: z.string().optional(),
  redirect: z.string().optional(),
})

export const Route = createFileRoute('/{-$locale}/reset-password')({
  validateSearch: searchSchema,
  beforeLoad: requireGuest,
  component: ResetPassword,
})

function ResetPassword() {
  const { token, error } = Route.useSearch()
  return (
    <main className="flex flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <ResetPasswordForm token={error ? undefined : token} />
      </div>
    </main>
  )
}
