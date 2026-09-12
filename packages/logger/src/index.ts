import pino, { type Logger, type LoggerOptions } from "pino";
import pretty from "pino-pretty";

export type { Logger };

export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface CreateLoggerOptions {
  /** Service name, attached to every line. */
  name: string;
  level?: LogLevel;
  /** Human-readable coloured output. Use in development only; JSON otherwise. */
  pretty?: boolean;
  /** Extra fields attached to every line, e.g. { env: "production" }. */
  base?: Record<string, unknown>;
}

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.password",
  "*.secret",
  "*.token",
];

/** Pino logger. JSON to stdout by default, pretty-printed when `pretty` is set. */
export function createLogger({ name, level = "info", pretty: usePretty = false, base }: CreateLoggerOptions): Logger {
  const options: LoggerOptions = {
    name,
    level,
    base: { ...base },
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    formatters: { level: (label) => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  return usePretty
    ? pino(options, pretty({ colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" }))
    : pino(options);
}
