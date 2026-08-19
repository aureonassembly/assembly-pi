import { spawn } from "node:child_process";
import type { TTSProvider } from "../types.js";

export class TermuxTtsProvider implements TTSProvider {
  async isAvailable(): Promise<boolean> {
    return true;
  }

  async speak(text: string): Promise<void> {
    const normalized = normalizeSpeechText(text);
    if (!normalized) return;

    await new Promise<void>((resolve, reject) => {
      const child = spawn("termux-tts-speak", [normalized], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code && code !== 0) {
          reject(new Error(stderr.trim() || `termux-tts-speak exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
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
