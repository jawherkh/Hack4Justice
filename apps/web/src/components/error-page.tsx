import { Link } from '@tanstack/react-router'
import { Button } from '@hack4justice/ui/components/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@hack4justice/ui/components/empty'
import { AlertTriangle, SearchX } from 'lucide-react'
import { toLocaleParam, type Locale } from '#/i18n'
import { createTranslator } from '#/i18n/context'

interface ErrorPageProps {
  locale: Locale
  kind: 'not-found' | 'error'
  onRetry?: () => void
}

/**
 * Shared not-found / error screen. Takes the locale explicitly because it can
 * render outside the I18nProvider (e.g. when the locale layout itself fails).
 */
export function ErrorPage({ locale, kind, onRetry }: ErrorPageProps) {
  const t = createTranslator(locale)
  const notFound = kind === 'not-found'

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{notFound ? <SearchX /> : <AlertTriangle />}</EmptyMedia>
          <EmptyTitle>{t(notFound ? 'notFound.title' : 'error.title')}</EmptyTitle>
          <EmptyDescription>{t(notFound ? 'notFound.description' : 'error.description')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          {onRetry ? (
            <Button variant="outline" onClick={onRetry}>
              {t('error.retry')}
            </Button>
          ) : null}
          <Button render={<Link to="/{-$locale}" params={{ locale: toLocaleParam(locale) }} />}>
            {t('error.home')}
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}
