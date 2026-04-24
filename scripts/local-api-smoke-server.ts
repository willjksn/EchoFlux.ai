import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Buffer } from "node:buffer";

import type { VercelRequest, VercelResponse } from "@vercel/node";

type ApiHandler = (req: VercelRequest, res: VercelResponse) => unknown | Promise<unknown>;
type ApiModule = { default: ApiHandler };

const DEFAULT_PORT = 3001;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const routeLoaders: Record<string, () => Promise<ApiModule>> = {
  "/api/createFanCheckoutSession": () => import("../api/createFanCheckoutSession.ts"),
  "/api/creatorOrders": () => import("../api/creatorOrders.ts"),
  "/api/fanPostMedia": () => import("../api/fanPostMedia.ts"),
  "/api/getCreatorByHandle": () => import("../api/getCreatorByHandle.ts"),
  "/api/getFanEntitlement": () => import("../api/getFanEntitlement.ts"),
};

function parsePort(raw: string | undefined): number {
  const n = Number.parseInt(raw || "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PORT;
}

function parseQuery(searchParams: URLSearchParams): VercelRequest["query"] {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams.entries()) {
    const existing = query[key];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else if (typeof existing === "string") {
      query[key] = [existing, value];
    } else {
      query[key] = value;
    }
  }
  return query;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.split("=");
    const key = rawKey?.trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(rest.join("=").trim());
  }
  return cookies;
}

async function readBody(req: IncomingMessage): Promise<{ rawBody: Buffer; body: unknown }> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
    }
    chunks.push(buf);
  }

  const rawBody = Buffer.concat(chunks);
  if (rawBody.byteLength === 0) return { rawBody, body: undefined };

  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const text = rawBody.toString("utf8");

  if (contentType.includes("application/json")) {
    return { rawBody, body: JSON.parse(text) };
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return { rawBody, body: Object.fromEntries(new URLSearchParams(text).entries()) };
  }

  return { rawBody, body: text };
}

function patchResponse(res: ServerResponse): VercelResponse {
  const vercelRes = res as VercelResponse;

  vercelRes.status = (statusCode: number) => {
    res.statusCode = statusCode;
    return vercelRes;
  };

  vercelRes.json = (jsonBody: unknown) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(jsonBody));
    return vercelRes;
  };

  vercelRes.send = (body: unknown) => {
    if (Buffer.isBuffer(body) || typeof body === "string") {
      res.end(body);
    } else if (body == null) {
      res.end();
    } else {
      vercelRes.json(body);
    }
    return vercelRes;
  };

  vercelRes.redirect = (statusOrUrl: number | string, urlMaybe?: string) => {
    const statusCode = typeof statusOrUrl === "number" ? statusOrUrl : 307;
    const url = typeof statusOrUrl === "string" ? statusOrUrl : urlMaybe;
    if (!url) {
      res.statusCode = 500;
      res.end("Missing redirect URL");
      return vercelRes;
    }
    res.statusCode = statusCode;
    res.setHeader("Location", url);
    res.end();
    return vercelRes;
  };

  return vercelRes;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://localhost");
  const pathname = url.pathname.replace(/\/$/, "") || "/";

  if (pathname === "/api/__local-health") {
    sendJson(res, 200, {
      ok: true,
      routes: Object.keys(routeLoaders).sort(),
    });
    return;
  }

  const loadRoute = routeLoaders[pathname];
  if (!loadRoute) {
    sendJson(res, 404, {
      error: "Local smoke API route is not mounted",
      path: pathname,
      mountedRoutes: Object.keys(routeLoaders).sort(),
    });
    return;
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const { rawBody, body } = await readBody(req);
    const vercelReq = Object.assign(req, {
      query: parseQuery(url.searchParams),
      body,
      cookies: parseCookies(req.headers.cookie),
      rawBody,
    }) as VercelRequest;
    const vercelRes = patchResponse(res);
    const mod = await loadRoute();

    await mod.default(vercelReq, vercelRes);

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? ((error as { statusCode: number }).statusCode)
        : 500;
    const message = error instanceof Error ? error.message : "Local API server error";
    console.error(`[local-api] ${req.method} ${pathname} failed:`, error);
    if (!res.writableEnded) {
      sendJson(res, statusCode, { error: message });
    }
  }
}

const port = parsePort(process.env.LOCAL_API_PORT);

createServer((req, res) => {
  void handle(req, res);
}).listen(port, () => {
  console.log(`[local-api] Listening on http://localhost:${port}`);
  console.log("[local-api] Mounted routes:");
  for (const route of Object.keys(routeLoaders).sort()) {
    console.log(`  ${route}`);
  }
});
