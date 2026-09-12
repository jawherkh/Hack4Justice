import { Elysia } from "elysia";

import { resolveLocale, translate, type Locale, type Params } from "./index";

export type Translate = (code: string, params?: Params) => string;

export function createTranslator(locale: Locale): Translate {
  return (code, params) => translate(locale, code, params);
}

/**
 * Adds `locale` and `t()` to every route context, resolved from the `locale`
 * cookie or Accept-Language. `t("upload_not_found")` returns the message in
 * the caller's language.
 */
export const i18n = new Elysia({ name: "i18n" }).derive({ as: "global" }, ({ request }) => {
  const locale = resolveLocale(request);
  return { locale, t: createTranslator(locale) };
});
