import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink, FileSearch, ListChecks, Mail, RouteIcon } from 'lucide-react'
import { Badge } from '@hack4justice/ui/components/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@hack4justice/ui/components/card'
import { useTranslation, type MessageKey } from '#/i18n'

export const Route = createFileRoute('/{-$locale}/about')({ component: About })

const BENEFITS: { icon: typeof FileSearch; title: MessageKey; description: MessageKey }[] = [
  {
    icon: ListChecks,
    title: 'about.features.guidance.title',
    description: 'about.features.guidance.description',
  },
  {
    icon: FileSearch,
    title: 'about.features.documents.title',
    description: 'about.features.documents.description',
  },
  {
    icon: RouteIcon,
    title: 'about.features.progress.title',
    description: 'about.features.progress.description',
  },
]

const CONTRIBUTORS = [
  { name: 'Aziz Becha', email: 'aziz07becha@gmail.com', github: 'azizbecha' },
  { name: 'Mohamed Arbi', email: 'mohammedarbinsibi@gmail.com', github: 'Goodnight77' },
  { name: 'Jawher Khalifa', email: 'jawherkhalifa@drugit.live', github: 'jawherkh' },
  { name: 'Mouayed Chouaieb', email: 'mouayed.chaieb@gmail.com', github: 'mwking0' },
  { name: 'Aziz Elyef', email: 'aziz.elhyf@gmail.com' },
] as const

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
}

function About() {
  const t = useTranslation()

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-16 md:py-24">
      <section className="flex flex-col items-start gap-5 md:items-center md:text-center">
        <Badge variant="secondary">{t('about.eyebrow')}</Badge>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-5xl">
          {t('about.hero.title')}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">{t('about.hero.description')}</p>
      </section>

      <section aria-labelledby="about-features-title" className="flex flex-col gap-6">
        <div className="max-w-2xl space-y-2">
          <h2 id="about-features-title" className="text-2xl font-semibold tracking-tight">
            {t('about.features.title')}
          </h2>
          <p className="text-muted-foreground">{t('about.features.description')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {BENEFITS.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon aria-hidden="true" className="size-5" />
                </div>
                <CardTitle>{t(title)}</CardTitle>
                <CardDescription>{t(description)}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="about-contributors-title" className="flex flex-col gap-6">
        <div className="max-w-2xl space-y-2">
          <h2 id="about-contributors-title" className="text-2xl font-semibold tracking-tight">
            {t('about.contributors.title')}
          </h2>
          <p className="text-muted-foreground">{t('about.contributors.description')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONTRIBUTORS.map((contributor) => (
            <Card key={contributor.name}>
              <CardHeader>
                <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                  {initials(contributor.name)}
                </div>
                <CardTitle>{contributor.name}</CardTitle>
                <CardDescription>{t('about.contributors.role')}</CardDescription>
                <div className="flex flex-col items-start gap-2 pt-3 text-sm">
                  {'email' in contributor && (
                    <a
                      className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                      href={`mailto:${contributor.email}`}
                    >
                      <Mail aria-hidden="true" className="size-4" />
                      <span className="break-all">{contributor.email}</span>
                    </a>
                  )}
                  {'github' in contributor && (
                    <a
                      className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                      href={`https://github.com/${contributor.github}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink aria-hidden="true" className="size-4" />
                      <span>@{contributor.github}</span>
                    </a>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </main>
  )
}
