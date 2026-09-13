/**
 * Minimal production HTTP server for TanStack Start.
 * Wraps the built SSR handler with Node's http module — no extra dependencies.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

// Load the built SSR handler
const { default: handler } = await import("./dist/server/server.js");

const MIME = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const clientDir = join(__dirname, "dist", "client");

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Serve static assets from dist/client
  const staticPath = join(clientDir, url.pathname);
  if (existsSync(staticPath) && !staticPath.endsWith("/")) {
    const ext = extname(staticPath);
    res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    createReadStream(staticPath).pipe(res);
    return;
  }

  // Forward everything else to the SSR handler
  try {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) headers[k] = Array.isArray(v) ? v.join(", ") : v;
    }

    const chunks = [];
    await new Promise((resolve) => {
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", resolve);
    });

    const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: body && body.length > 0 ? body : undefined,
    });

    const response = await handler.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err) {
    console.error("SSR error:", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Web server listening on http://${HOST}:${PORT}`);
});
