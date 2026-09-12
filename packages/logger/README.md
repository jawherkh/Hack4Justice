# @hack4justice/logger

[pino](https://getpino.io) wrapper. JSON lines in production, pretty output in development.

```ts
import { createLogger } from "@hack4justice/logger";

const logger = createLogger({ name: "api", level: "debug", pretty: true });
logger.info({ userId }, "upload stored");
logger.error({ err }, "extraction failed");

const child = logger.child({ requestId });
```

Authorization and cookie headers, plus any `password`, `secret` or `token` field, are redacted automatically.
