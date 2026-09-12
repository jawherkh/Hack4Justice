# web

TanStack Start app for Hack4Justice.

```bash
pnpm install
pnpm dev
```

Routes live under `src/routes/{-$locale}`; TanStack Router regenerates
`src/routeTree.gen.ts` automatically.

The Elysia API client is exported from `src/lib/api.ts` (`api`), with types
flowing from `@hack4justice/api`. `VITE_API_URL` (root `.env`) points it at a non-local API.

## i18n

Locale is an optional path prefix (`/{-$locale}`): `/` is French (default,
no prefix), `/en` English, `/ar` Arabic (RTL). Unknown prefixes 404.

- `src/i18n/locales.ts` — supported locales, default, direction helpers.
- `src/i18n/messages/*.json` — translations; `en.json` defines the key set, other
  locales must satisfy it (type-checked).
- `src/routes/{-$locale}/route.tsx` — validates the prefix and provides
  `I18nProvider`; every page route lives under this layout.
- Use `useTranslation()` / `useI18n()` in components, `createTranslator(locale)`
  outside React (e.g. route `head`).
- Switch language with `<LanguageSwitcher />` or a `Link` that sets the
  `locale` param (`undefined` for the default locale).

Build the production app with:

```bash
pnpm build
```
