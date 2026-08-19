import { createReadStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

export type ControlCommand = "TOGGLE" | "SEND" | "CLEAR" | "SPEAK" | "QUIT";

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
        this.dispatch(line.trim().toUpperCase());
      }
    });

    stream.on("end", () => {
      if (buffer.trim()) this.dispatch(buffer.trim().toUpperCase());
      setTimeout(() => this.openReader(), 25);
    });

    stream.on("error", () => {
      setTimeout(() => this.openReader(), 250);
    });
  }

  private dispatch(raw: string): void {
    if (!raw) return;
    if (raw === "TOGGLE" || raw === "SEND" || raw === "CLEAR" || raw === "SPEAK" || raw === "QUIT") {
      this.onCommand(raw);
    }
  }
}
