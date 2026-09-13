import { env } from "../env";
import { createDeepSeekOcrClient } from "./deepseek";
import { createDocumentTextExtractor } from "./document";
import { PopplerReader } from "./pdf";

export const documentTextExtractor = createDocumentTextExtractor({
  pdf: new PopplerReader(),
  ocr: createDeepSeekOcrClient({
    endpoint: env.DEEPSEEK_OCR_ENDPOINT,
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_OCR_MODEL,
  }),
});

export {
  createDeepSeekOcrClient,
  DeepSeekOcrError,
  type DeepSeekOcrClient,
  type DeepSeekOcrSettings,
  type HttpRequest,
} from "./deepseek";
export {
  createDocumentTextExtractor,
  usableNative,
  type DocumentTextExtractor,
  type DocumentTextInput,
  type DocumentTextResult,
} from "./document";
export { PdfError, PopplerReader, isPdfBytes, type PdfReader, type PreparedPdf } from "./pdf";
