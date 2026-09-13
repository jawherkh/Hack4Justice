import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { OnboardingWizard } from '#/components/onboarding/onboarding-wizard'
import { projectsHref, requireNotOnboarded, safeRedirect } from '#/lib/guards'

const searchSchema = z.object({ redirect: z.string().optional() })

export const Route = createFileRoute('/{-$locale}/onboarding')({
  validateSearch: searchSchema,
  beforeLoad: requireNotOnboarded,
  component: Onboarding,
})

function Onboarding() {
  const { redirect } = Route.useSearch()
  const { locale, session } = Route.useRouteContext()
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-4 py-8">
      <OnboardingWizard
        key={session.user.id}
        name={session.user.name}
        redirectTo={safeRedirect(redirect, projectsHref(locale))}
      />
    </main>
  )
}
