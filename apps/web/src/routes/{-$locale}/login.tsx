import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { LoginForm } from '#/components/auth/login-form'
import { requireGuest, safeRedirect, projectsHref } from '#/lib/guards'

const searchSchema = z.object({ redirect: z.string().optional() })

export const Route = createFileRoute('/{-$locale}/login')({
  validateSearch: searchSchema,
  beforeLoad: requireGuest,
  component: Login,
})

function Login() {
  const { redirect } = Route.useSearch()
  const { locale } = Route.useRouteContext()
  return (
    <main className="flex flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm redirectTo={safeRedirect(redirect, projectsHref(locale))} />
      </div>
    </main>
  )
}
