import { createFileRoute } from '@tanstack/react-router'
import { ChangePasswordForm } from '#/components/auth/change-password-form'
import { ProfileForm } from '#/components/auth/profile-form'
import { SessionsCard } from '#/components/auth/sessions-card'
import { useTranslation } from '#/i18n'
import { requireAuth } from '#/lib/guards'

export const Route = createFileRoute('/{-$locale}/account')({
  beforeLoad: requireAuth,
  component: Account,
})

function Account() {
  const t = useTranslation()
  const { session } = Route.useRouteContext()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('account.title')}</h1>
        <p className="text-sm text-muted-foreground">{session.user.email}</p>
      </div>
      <ProfileForm key={session.user.name} name={session.user.name} />
      <ChangePasswordForm />
      <SessionsCard />
    </main>
  )
}
