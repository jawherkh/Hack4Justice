import * as React from 'react'
import { type Locale, getDirection } from './locales'
import { type MessageKey, messages } from './messages'

type Vars = Record<string, string | number>

export type Translate = (key: MessageKey, vars?: Vars) => string

export interface I18n {
  locale: Locale
  dir: 'ltr' | 'rtl'
  t: Translate
}

const I18nContext = React.createContext<I18n | null>(null)

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

export function createTranslator(locale: Locale): Translate {
  const dict = messages[locale]
  return (key, vars) => interpolate(dict[key], vars)
}

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = React.useMemo<I18n>(
    () => ({ locale, dir: getDirection(locale), t: createTranslator(locale) }),
    [locale],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = React.useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used inside <I18nProvider>')
  }
  return ctx
}

export function useTranslation(): Translate {
  return useI18n().t
}
