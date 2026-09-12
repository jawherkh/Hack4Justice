import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from '#/i18n'

export const Route = createFileRoute('/{-$locale}/login')({ component: Login })

function Login() {
  const t = useTranslation()

  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      <h1 className="text-3xl font-bold tracking-tight">{t('login.title')}</h1>
    </main>
  )
}
