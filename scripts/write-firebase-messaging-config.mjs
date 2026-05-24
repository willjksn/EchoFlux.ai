/**
 * Writes public/firebase-messaging-config.json for the FCM service worker.
 * Uses VITE_FIREBASE_* from the environment (Vercel build or local .env.local).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

function clean(value) {
  if (typeof value !== "string") return undefined;
  const t = value.trim().replace(/^["']|["']$/g, "");
  return t || undefined;
}

const config = {
  apiKey: clean(process.env.VITE_FIREBASE_API_KEY),
  authDomain: clean(process.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: clean(process.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: clean(process.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: clean(process.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: clean(process.env.VITE_FIREBASE_APP_ID),
};

if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
  console.warn(
    "[write-firebase-messaging-config] Missing VITE_FIREBASE_* vars — skipping (push SW may not init locally).",
  );
  process.exit(0);
}

const outPath = path.join(root, "public", "firebase-messaging-config.json");
fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log("[write-firebase-messaging-config] Wrote", outPath);
