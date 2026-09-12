import type { Locale } from '../locales'
import ar from './ar.json'
import en from './en.json'
import fr from './fr.json'

/** `en.json` is the source of truth for the key set. */
export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>

// Assigning to `Messages` fails to compile if a locale is missing a key.
// `satisfies` additionally rejects keys that do not exist in `en.json`.
export const messages: Record<Locale, Messages> = {
  en,
  fr: fr satisfies Messages,
  ar: ar satisfies Messages,
}
