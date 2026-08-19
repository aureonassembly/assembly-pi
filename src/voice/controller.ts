import { existsSync } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import type { RecordingSession } from "../types.js";

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCommand(command: string, args: string[], ignoreFailure = false): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (err) => {
      if (ignoreFailure) resolve(stdout);
      else reject(err);
    });
    child.on("close", (code) => {
      if (code && code !== 0 && !ignoreFailure) reject(new Error(stderr.trim() || `${command} exited ${code}`));
      else resolve(stdout.trim() || stderr.trim());
    });
  });
}

async function waitForStableFile(filePath: string, timeoutMs = 5000): Promise<number> {
  const started = Date.now();
  let previous = -1;
  let stableCount = 0;
  let lastSize = 0;

  while (Date.now() - started < timeoutMs) {
    try {
      const size = (await stat(filePath)).size;
      lastSize = size;
      if (size > 0 && size === previous) {
        stableCount += 1;
        if (stableCount >= 3) return size;
      } else {
        stableCount = 0;
      }
      previous = size;
    } catch {
      stableCount = 0;
    }
    await delay(200);
  }

  return lastSize;
}

export class TermuxMicrophoneRecordingSession implements RecordingSession {
  private active = false;

  constructor(public readonly path: string) {}

  isRecording(): boolean {
    return this.active;
  }

  async start(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await runCommand("termux-microphone-record", ["-q"], true);
    await unlink(this.path).catch(() => undefined);

    const output = await runCommand("termux-microphone-record", ["-f", this.path, "-l", "0"]);
    if (!/Recording started/i.test(output)) {
      throw new Error(output || "termux-microphone-record did not report that recording started");
    }

    this.active = true;
    await delay(750);
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    await runCommand("termux-microphone-record", ["-q"], true);
    const size = await waitForStableFile(this.path, 6000);
    this.active = false;

    if (!existsSync(this.path) || size <= 128) {
      throw new Error(
        `No usable microphone recording was created at ${this.path}. Try holding VOICE ASK longer before stopping.`,
      );
    }
  }
}
