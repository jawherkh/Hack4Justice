import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRight, FileText, ListChecks, ShieldCheck } from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Button } from '@hack4justice/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { toLocaleParam, useI18n, type MessageKey } from '#/i18n'
import { redirectSignedIn } from '#/lib/guards'

// Signed-in users have a home already: their projects.
export const Route = createFileRoute('/{-$locale}/')({ beforeLoad: redirectSignedIn, component: Home })

const FEATURES: { icon: typeof FileText; title: MessageKey; description: MessageKey }[] = [
  { icon: FileText, title: 'home.features.upload.title', description: 'home.features.upload.description' },
  { icon: ListChecks, title: 'home.features.track.title', description: 'home.features.track.description' },
  { icon: ShieldCheck, title: 'home.features.secure.title', description: 'home.features.secure.description' },
]

function Home() {
  const { t, locale } = useI18n()
  const params = { locale: toLocaleParam(locale) }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-16 md:py-24">
      <section className="flex flex-col items-start gap-6 md:items-center md:text-center">
        <Badge variant="secondary">{t('home.hero.eyebrow')}</Badge>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-5xl">
          {t('home.hero.title')}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">{t('home.hero.subtitle')}</p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" render={<Link to="/{-$locale}/register" params={params} />}>
            {t('home.hero.cta')}
            <ArrowRight data-icon="inline-end" className="rtl:rotate-180" />
          </Button>
          <Button size="lg" variant="outline" render={<Link to="/{-$locale}/about" params={params} />}>
            {t('home.hero.learnMore')}
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardHeader>
              <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </div>
              <CardTitle>{t(title)}</CardTitle>
              <CardDescription>{t(description)}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </section>
    </main>
  )
}
