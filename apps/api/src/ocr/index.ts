import { env } from "../env";
import { createTikaClient } from "./tika";

export const tika = createTikaClient(env.TIKA_URL);
export { TikaError, type ExtractResult } from "./tika";
