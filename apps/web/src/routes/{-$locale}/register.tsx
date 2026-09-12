import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SignupForm } from '#/components/auth/signup-form'
import { requireGuest, safeRedirect, homeHref } from '#/lib/guards'

const searchSchema = z.object({ redirect: z.string().optional() })

export const Route = createFileRoute('/{-$locale}/register')({
  validateSearch: searchSchema,
  beforeLoad: requireGuest,
  component: Register,
})

function Register() {
  const { redirect } = Route.useSearch()
  const { locale } = Route.useRouteContext()
  return (
    <main className="flex flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignupForm redirectTo={safeRedirect(redirect, homeHref(locale))} />
      </div>
    </main>
  )
}
