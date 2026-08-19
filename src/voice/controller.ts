import { existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname } from "node:path";
import type { RecordingSession } from "../types.js";

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStableFile(filePath: string, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  let previous = -1;
  let stableCount = 0;

  while (Date.now() - started < timeoutMs) {
    try {
      const size = (await stat(filePath)).size;
      if (size > 0 && size === previous) {
        stableCount += 1;
        if (stableCount >= 2) return;
      } else {
        stableCount = 0;
      }
      previous = size;
    } catch {
      stableCount = 0;
    }
    await delay(150);
  }
}

export class TermuxMicrophoneRecordingSession implements RecordingSession {
  private active = false;

  constructor(public readonly path: string) {}

  isRecording(): boolean {
    return this.active;
  }

  async start(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    if (existsSync(this.path)) {
      // Leave any prior file intact only after the user has chosen a new path.
      // We overwrite here intentionally because each recording path is unique.
    }

    const child = spawn("termux-microphone-record", ["-f", this.path, "-l", "0"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.on("error", () => {
      // Ignore here; the UI will discover failures when the stop workflow checks the file.
    });

    this.active = true;
    await delay(250);
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    await new Promise<void>((resolve) => {
      const child = spawn("termux-microphone-record", ["-q"], { stdio: ["ignore", "ignore", "ignore"] });
      child.on("close", () => resolve());
      child.on("error", () => resolve());
    });
    await waitForStableFile(this.path, 4000);
    this.active = false;
  }
}
