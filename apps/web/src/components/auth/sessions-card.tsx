import * as React from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { Spinner } from '@hack4justice/ui/components/spinner'
import { toLocaleParam, useI18n } from '#/i18n'
import { authClient, signOut } from '#/lib/auth'

export function SessionsCard() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const navigate = useNavigate()
  const [pending, setPending] = React.useState<'revoke' | 'signOut' | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  async function onRevoke() {
    setPending('revoke')
    const result = await authClient.revokeOtherSessions()
    setPending(null)
    if (!result.error) setMessage(t('account.sessions.revoked'))
  }

  async function onSignOut() {
    setPending('signOut')
    await signOut()
    await router.invalidate()
    await navigate({ to: '/{-$locale}', params: { locale: toLocaleParam(locale) } })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.sessions.title')}</CardTitle>
        <CardDescription>{t('account.sessions.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending !== null} onClick={onRevoke}>
            {pending === 'revoke' ? <Spinner data-icon="inline-start" /> : null}
            {t('account.sessions.revoke')}
          </Button>
          <Button variant="ghost" disabled={pending !== null} onClick={onSignOut}>
            {pending === 'signOut' ? <Spinner data-icon="inline-start" /> : null}
            {t('account.sessions.signOut')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
