import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function parseEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;
  const idx = trimmed.indexOf("=");
  if (idx <= 0) return undefined;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

export function loadLocalEnv(cwd: string): void {
  const candidates = [
    join(cwd, ".env"),
    join(process.env.HOME ?? cwd, ".config/assembly-pi/env"),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const pair = parseEnvLine(line);
      if (!pair) continue;
      const [key, value] = pair;
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
