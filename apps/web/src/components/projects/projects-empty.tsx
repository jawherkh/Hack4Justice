import { PROJECT_DESTINATIONS } from '@hack4justice/shared'
import { Plus, SearchX } from 'lucide-react'
import { Button } from '@hack4justice/ui/components/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import { cn } from '@hack4justice/ui/lib/utils'
import { useTranslation } from '#/i18n'
import { DESTINATION_META } from './destination'

/** First-run state: a small preview of the two agencies and one clear action. */
export function ProjectsWelcome({ onCreate }: { onCreate: () => void }) {
  const t = useTranslation()
  return (
    <section className="relative overflow-hidden rounded-2xl border border-dashed bg-background px-6 py-14 text-center">
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-5">
        <div className="flex items-end gap-3">
          {PROJECT_DESTINATIONS.map((value, index) => {
            const meta = DESTINATION_META[value]
            return (
              <div
                key={value}
                className={cn(
                  'flex w-28 flex-col items-center gap-2 rounded-xl bg-card p-3 shadow-sm ring-1 ring-foreground/10',
                  index === 0 ? '-rotate-3' : 'rotate-3',
                )}
              >
                <img
                  src={meta.logo}
                  alt={t(meta.full)}
                  draggable={false}
                  className="h-9 w-auto max-w-full object-contain"
                />
                <span className="text-xs font-semibold tracking-wide">{t(meta.label)}</span>
                <span className="h-1.5 w-16 rounded-full bg-muted" />
                <span className="h-1.5 w-10 rounded-full bg-muted" />
              </div>
            )
          })}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            {t('projects.empty.eyebrow')}
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-balance">{t('projects.empty.title')}</h2>
          <p className="text-sm text-pretty text-muted-foreground">{t('projects.empty.description')}</p>
        </div>
        <Button size="lg" onClick={onCreate}>
          <Plus data-icon="inline-start" />
          {t('projects.empty.cta')}
        </Button>
      </div>
    </section>
  )
}

export function ProjectsNoResults({
  query,
  filtered,
  onClear,
}: {
  query: string
  filtered: boolean
  onClear: () => void
}) {
  const t = useTranslation()
  return (
    <Empty className="rounded-2xl border border-dashed py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX />
        </EmptyMedia>
        <EmptyTitle>{t('projects.noResults.title')}</EmptyTitle>
        <EmptyDescription>
          {query ? t('projects.noResults.description', { query }) : t('projects.noResults.descriptionFilter')}
        </EmptyDescription>
      </EmptyHeader>
      {query || filtered ? (
        <EmptyContent>
          <Button variant="outline" onClick={onClear}>
            {t('projects.noResults.clear')}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}
