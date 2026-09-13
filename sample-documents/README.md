# Sample MSME documents (synthetic, for manual QA)

Two fabricated PDFs for manually exercising Dalil's upload → OCR extraction →
agent pipeline end to end. Both have a native text layer (no OCR fallback
needed) and a diagonal "SPECIMEN — DOCUMENT DE TEST" watermark plus a footer
notice, so they can never be mistaken for a real government document. Field
values are made up but shaped like the real patterns Dalil validates against
(`packages/shared/src/procedures/fields.ts`), so extracted fields pass
validation the same way a real document's would.

- **`auto-entrepreneur-carte-fiscale.pdf`** — a "Carte d'identification
  fiscale" (DGI) for a fictional auto-entrepreneur / entreprise individuelle.
  Matricule fiscal `1284736K/A/P/000`, CIN `07845213`.
- **`sarl-extrait-rne.pdf`** — an "Extrait d'immatriculation au RNE" for a
  fictional SARL. Identifiant RNE `B-547219-2026`, matricule fiscal
  `9316482B/A/M/000`, gérant CIN `01234567`.

## Use

Sign in to the web app, open **Uploads**, and upload either PDF against a
requirement such as `FISCAL_IDENTIFIER`, `RNE_EXTRACT`, or `MANAGER_CIN` to
watch native-text extraction and the agent's field proposals run against
realistic values.

Not wired into any automated test — this is a manual QA aid.
