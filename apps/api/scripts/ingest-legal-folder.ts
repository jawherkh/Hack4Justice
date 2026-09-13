import { env } from "../src/env";
import { documentTextExtractor } from "../src/ocr";
import { ingestPdfFolder } from "../src/ingestion/folder";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const folder = argument("--folder");
const agency = argument("--agency");
if (!folder || !agency) {
  throw new Error("Usage: pnpm --filter @hack4justice/api ingest:legal-folder -- --folder ./legal-pdfs --agency RNE [--languages fra+ara]");
}

const result = await ingestPdfFolder({
  folder,
  agency,
  graphitiEndpoint: `${env.GRAPHITI_URL.replace(/\/$/, "")}/api/v1/knowledge/ingest/bulk`,
  extractor: documentTextExtractor,
  languages: argument("--languages"),
  language: argument("--language") ?? "fr",
  sourceUriPrefix: argument("--source-prefix"),
});

console.log(JSON.stringify(result));
