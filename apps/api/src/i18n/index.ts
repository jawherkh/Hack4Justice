import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  humanizeCode,
  isLocale,
  type Locale,
} from "@hack4justice/shared";

import ar from "./messages/ar.json";
import en from "./messages/en.json";
import fr from "./messages/fr.json";

export type MessageKey = keyof typeof fr;
type Messages = Record<MessageKey, string>;

const messages: Record<Locale, Messages> = { fr, en: en satisfies Messages, ar: ar satisfies Messages };

export type Params = Record<string, string | number>;

/**
 * Translates an error code. Falls back to the default locale, then to a
 * humanized version of the code, so unknown codes never leak raw snake_case.
 */
export function translate(locale: Locale, code: string, params?: Params): string {
  const template =
    (messages[locale] as Record<string, string>)[code] ??
    (messages[DEFAULT_LOCALE] as Record<string, string>)[code] ??
    humanizeCode(code);
  return params ? interpolate(template, params) : template;
}

function interpolate(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/**
 * Locale for a request: `locale` cookie (set by the web app), then
 * Accept-Language, then the platform default (French).
 */
export function resolveLocale(request: Request): Locale {
  const fromCookie = readCookie(request.headers.get("cookie"), LOCALE_COOKIE);
  if (isLocale(fromCookie)) return fromCookie;

  const accept = request.headers.get("accept-language");
  if (accept) {
    for (const part of accept.split(",")) {
      const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
      const base = tag.split("-")[0];
      if (isLocale(base)) return base;
    }
  }
  return DEFAULT_LOCALE;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale };
