import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const appDir = resolve(process.env.H4J_APP_DIR ?? ".");
const distDir = resolve(appDir, "dist");
const clientDir = resolve(distDir, "client");
const serverEntry = resolve(distDir, "server/server.js");
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const module = await import(pathToFileURL(serverEntry).href);
const handler = module.default?.fetch ?? module.default;
if (typeof handler !== "function") {
  throw new Error(`The TanStack server entry does not export a fetch handler: ${serverEntry}`);
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safeStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("..")) return null;
  const candidate = resolve(clientDir, `.${decoded}`);
  if (candidate !== clientDir && !candidate.startsWith(`${clientDir}${sep}`)) return null;
  return candidate;
}

async function serveStatic(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const candidate = safeStaticPath(new URL(request.url).pathname);
  if (!candidate) return false;

  let file;
  try {
    file = await stat(candidate);
  } catch {
    return false;
  }
  if (!file.isFile()) return false;

  response.statusCode = 200;
  response.setHeader("Content-Length", file.size);
  response.setHeader("Content-Type", mimeTypes[extname(candidate).toLowerCase()] ?? "application/octet-stream");
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  createReadStream(candidate).pipe(response);
  return true;
}

async function readRequest(request) {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  return request;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const staticRequest = new Request(url, { method: request.method, headers: request.headers });
    if (await serveStatic(staticRequest, response)) return;

    const body = await readRequest(request);
    const webRequest = new Request(url, {
      method: request.method,
      headers: request.headers,
      body,
      duplex: body ? "half" : undefined,
    });
    const webResponse = await handler(webRequest);
    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => response.setHeader(key, value));
    if (!webResponse.body || request.method === "HEAD") {
      response.end();
      return;
    }
    const reader = webResponse.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      response.write(Buffer.from(chunk.value));
    }
    response.end();
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.statusCode = 500;
    response.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`TanStack Start server listening on http://${host}:${port}`);
});

