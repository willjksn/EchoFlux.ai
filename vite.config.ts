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
 * 2. `npm run dev` → http://localhost:3000 — `/api/*` is proxied to that URL.
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
      port: 3000,
      strictPort: true,
      host: "localhost",
      hmr: {
        host: "localhost",
        protocol: "ws",
        port: 3000,
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
