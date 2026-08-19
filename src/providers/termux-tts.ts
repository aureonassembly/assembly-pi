import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { TTSProvider } from "../types.js";

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0) reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
      else resolve();
    });
  });
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await run("sh", ["-lc", `command -v ${command} >/dev/null 2>&1`]);
    return true;
  } catch {
    return false;
  }
}

export class TermuxTtsProvider implements TTSProvider {
  async isAvailable(): Promise<boolean> {
    return await commandExists("espeak") || await commandExists("termux-tts-speak");
  }

  async speak(text: string): Promise<void> {
    const normalized = normalizeSpeechText(text);
    if (!normalized) return;

    if (await commandExists("espeak")) {
      const wav = join(tmpdir(), `assembly-pi-tts-${Date.now()}.wav`);
      await run("espeak", ["-s", "155", "-w", wav, normalized]);
      await run("termux-media-player", ["play", wav]);
      return;
    }

    await run("termux-tts-speak", ["-s", "MUSIC", normalized]);
  }
}

export function normalizeSpeechText(text: string): string {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length <= 600) return stripped;
  return `${stripped.slice(0, 600).trimEnd()}…`;
}
