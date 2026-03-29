import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/** Strip quotes and whitespace from .env values */
function trimEnvValue(v: string | undefined): string {
  if (v == null || v === "") return "";
  return v.trim().replace(/^["']|["']$/g, "");
}

/**
 * Full-stack local dev without `vercel dev`:
 *
 * 1. Add to `.env.local` (repo root):
 *    DEV_API_PROXY=https://your-app.vercel.app
 * 2. `npm run dev` → http://localhost:3000 (or next free port) — `/api/*` is proxied to that URL.
 *
 * Or one-shot (PowerShell): `$env:DEV_API_PROXY="https://..."; npm run dev`
 *
 * Default: proxy → http://localhost:3001 (usually unused).
 */
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), ["DEV_", "VITE_"]);
  const raw =
    trimEnvValue(process.env.DEV_API_PROXY) ||
    trimEnvValue(fileEnv.DEV_API_PROXY);
  const defaultTarget = "http://localhost:3001";
  let apiTarget = raw.replace(/\/$/, "") || defaultTarget;

  if (raw) {
    try {
      const u = new URL(apiTarget);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        console.warn(
          `[vite] DEV_API_PROXY must be http(s): — ignoring, using ${defaultTarget}`
        );
        apiTarget = defaultTarget;
      } else {
        apiTarget = `${u.protocol}//${u.host}`;
      }
    } catch {
      console.warn(
        `[vite] DEV_API_PROXY is not a valid URL — ignoring, using ${defaultTarget}`
      );
      apiTarget = defaultTarget;
    }
  }

  const isHttps = apiTarget.startsWith("https://");

  return {
    plugins: [
      react(),
      {
        name: "dev-api-proxy-log",
        configureServer(server) {
          server.httpServer?.once("listening", () => {
            const { logger } = server.config;
            const addr = server.httpServer?.address();
            const port =
              addr && typeof addr === "object" && "port" in addr ? String((addr as { port: number }).port) : "";
            if (port && port !== "3000") {
              logger.warn(
                `\n  [vite] Dev server is on port ${port} (3000 was busy). Open http://localhost:${port}/ — check the terminal “Local:” line.\n`
              );
            }
            if (apiTarget === defaultTarget) {
              logger.warn(
                "\n  [vite] DEV_API_PROXY not set: /api -> http://localhost:3001 (often nothing listening).\n  Add DEV_API_PROXY=https://your-deployment.vercel.app to .env.local\n  See docs/LOCAL_DEV.md\n"
              );
            } else {
              logger.info(
                `\n  [vite] API proxy active: /api -> ${apiTarget}\n`
              );
            }
          });
        },
      },
    ],
    server: {
      /** Prefer 3000 for OAuth / Firebase referrer presets; if busy Vite picks the next port. */
      port: 3000,
      strictPort: true,
      /** Open the app in the default browser to the correct port (fixes “server runs but I see nothing” on :3000). */
      open: true,
      /** Listen on all interfaces so http://127.0.0.1:<port>/ works if localhost misbehaves. */
      host: true,
      hmr: {
        host: "localhost",
      },
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: isHttps,
          /** Long cold starts on Vercel serverless */
          timeout: 120_000,
          proxyTimeout: 120_000,
          rewrite: (path) => path,
          configure: (proxy) => {
            proxy.on("error", (err, _req, res) => {
              const r = res as import("http").ServerResponse;
              if (!r.headersSent) {
                r.writeHead(502, { "Content-Type": "text/plain" });
              }
              r.end(
                `API proxy error (${apiTarget}): ${err.message}\nCheck DEV_API_PROXY and that the deployment is up.`
              );
            });
          },
        },
      },
    },
  };
});
