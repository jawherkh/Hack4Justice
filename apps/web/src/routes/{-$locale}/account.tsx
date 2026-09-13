import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { ChangePasswordForm } from '#/components/auth/change-password-form'
import { SessionsCard } from '#/components/auth/sessions-card'
import { ProfileDetailsForm } from '#/components/onboarding/profile-details-form'
import { toLocaleParam, useTranslation } from '#/i18n'
import { requireAuth } from '#/lib/guards'

export const Route = createFileRoute('/{-$locale}/account')({
  beforeLoad: requireAuth,
  component: Account,
})

function Account() {
  const t = useTranslation()
  const { session, profile, locale } = Route.useRouteContext()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('account.title')}</h1>
        <p className="text-sm text-muted-foreground">{session.user.email}</p>
      </div>
      {profile ? (
        <ProfileDetailsForm key={profile.userId} profile={profile} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('account.profile.title')}</CardTitle>
            <CardDescription>{t('account.profile.incomplete')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link to="/{-$locale}/onboarding" params={{ locale: toLocaleParam(locale) }} />}>
              {t('account.profile.complete')}
              <ArrowRight data-icon="inline-end" className="rtl:-scale-x-100" />
            </Button>
          </CardContent>
        </Card>
      )}
      <ChangePasswordForm />
      <SessionsCard />
    </main>
  )
}
