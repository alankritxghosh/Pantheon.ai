import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

function packageRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const folderName = path.basename(moduleDir);
  return folderName === "src" || folderName === "dist" ? path.dirname(moduleDir) : moduleDir;
}

function loadEnvFile(envPath: string): void {
  if (!fs.existsSync(envPath)) return;
  dotenv.config({ path: envPath, override: false });
}

loadEnvFile(path.join(process.cwd(), ".env"));
loadEnvFile(path.join(os.homedir(), ".pantheon", ".env"));
loadEnvFile(path.join(packageRoot(), ".env"));
