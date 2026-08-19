import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
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

function localBin(command: string): string {
  return join(process.env.HOME ?? "", ".local/bin", command);
}

async function commandExists(command: string): Promise<boolean> {
  if (existsSync(localBin(command))) return true;
  try {
    await run("sh", ["-lc", `command -v ${command} >/dev/null 2>&1`]);
    return true;
  } catch {
    return false;
  }
}

function commandPath(command: string): string {
  const local = localBin(command);
  return existsSync(local) ? local : command;
}

export class TermuxTtsProvider implements TTSProvider {
  async isAvailable(): Promise<boolean> {
    return await commandExists("edge-tts") || await commandExists("espeak") || await commandExists("termux-tts-speak");
  }

  async speak(text: string): Promise<void> {
    const normalized = normalizeSpeechText(text);
    if (!normalized) return;

    if (await commandExists("edge-tts")) {
      const mp3 = join(tmpdir(), `assembly-pi-edge-tts-${Date.now()}.mp3`);
      const voice = process.env.EDGE_TTS_VOICE || "en-US-AriaNeural";
      await run(commandPath("edge-tts"), ["--voice", voice, "--text", normalized, "--write-media", mp3]);
      await run("termux-media-player", ["play", mp3]);
      return;
    }

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
