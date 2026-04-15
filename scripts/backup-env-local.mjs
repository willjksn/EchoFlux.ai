/**
 * Copies `.env.local` to ~/Documents/echoflux-env-backup-<timestamp>.env
 * (gitignored pattern; keep this file out of git history and cloud-sync if you treat it as sensitive).
 */
import fs from "fs";
import os from "os";
import path from "path";

const src = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(src)) {
  console.error("No .env.local in project root.");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = path.join(os.homedir(), "Documents", `echoflux-env-backup-${stamp}.env`);

fs.copyFileSync(src, dest);
console.log("Backed up to:\n", dest);
