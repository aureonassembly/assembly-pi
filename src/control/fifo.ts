import { createReadStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

export type SimpleControlCommand = "TOGGLE" | "SEND" | "CLEAR" | "SPEAK" | "QUIT";
export type ControlCommand = SimpleControlCommand | { type: "PROMPT"; text: string };

export const DEFAULT_FIFO_PATH = join(process.env.HOME ?? ".", ".local/state/assembly-pi/control.fifo");

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
      if (code && code !== 0) reject(new Error(stderr.trim() || `${command} exited ${code}`));
      else resolve();
    });
  });
}

export async function ensureControlFifo(path = DEFAULT_FIFO_PATH): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    await run("mkfifo", [path]);
  }
  return path;
}

export class FifoControlServer {
  private stopped = false;

  constructor(
    private readonly fifoPath: string,
    private readonly onCommand: (command: ControlCommand) => void,
  ) {}

  start(): void {
    this.openReader();
  }

  stop(): void {
    this.stopped = true;
  }

  private openReader(): void {
    if (this.stopped) return;

    const stream = createReadStream(this.fifoPath, { encoding: "utf8" });
    let buffer = "";

    stream.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        this.dispatch(line.trim());
      }
    });

    stream.on("end", () => {
      if (buffer.trim()) this.dispatch(buffer.trim());
      setTimeout(() => this.openReader(), 25);
    });

    stream.on("error", () => {
      setTimeout(() => this.openReader(), 250);
    });
  }

  private dispatch(raw: string): void {
    if (!raw) return;

    if (raw.startsWith("PROMPT\t")) {
      const encoded = raw.slice("PROMPT\t".length);
      try {
        const text = Buffer.from(encoded, "base64url").toString("utf8").trim();
        if (text) this.onCommand({ type: "PROMPT", text });
      } catch {
        // Ignore malformed prompt commands.
      }
      return;
    }

    const upper = raw.toUpperCase();
    if (upper === "TOGGLE" || upper === "SEND" || upper === "CLEAR" || upper === "SPEAK" || upper === "QUIT") {
      this.onCommand(upper);
    }
  }
}
