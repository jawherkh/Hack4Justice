import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ForgotPasswordForm } from '#/components/auth/forgot-password-form'
import { requireGuest } from '#/lib/guards'

export const Route = createFileRoute('/{-$locale}/forgot-password')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: requireGuest,
  component: ForgotPassword,
})

function ForgotPassword() {
  return (
    <main className="flex flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <ForgotPasswordForm />
      </div>
    </main>
  )
}
