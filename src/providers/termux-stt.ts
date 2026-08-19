import { spawn } from "node:child_process";
import { TranscriptResult, type STTProvider } from "../types.js";

export class TermuxSpeechToTextProvider implements STTProvider {
  async transcribe(signal?: AbortSignal, onPartial?: (partial: string) => void): Promise<TranscriptResult> {
    return await this.runWithRetry(signal, onPartial, 2);
  }

  private async runWithRetry(
    signal: AbortSignal | undefined,
    onPartial: ((partial: string) => void) | undefined,
    attempts: number,
  ): Promise<TranscriptResult> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.runOnce(signal, onPartial);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }
    }

    throw lastError ?? new Error("termux-speech-to-text failed without a detailed error");
  }

  private async runOnce(
    signal: AbortSignal | undefined,
    onPartial: ((partial: string) => void) | undefined,
  ): Promise<TranscriptResult> {
    const started = Date.now();
    const partials: string[] = [];
    let stdout = "";
    let stderr = "";

    return await new Promise<TranscriptResult>((resolve, reject) => {
      const child = spawn("termux-speech-to-text", [], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      const abortChild = () => {
        try {
          child.kill("SIGINT");
          setTimeout(() => child.kill("SIGTERM"), 400);
        } catch {
          // ignore
        }
      };

      if (signal) {
        if (signal.aborted) abortChild();
        signal.addEventListener("abort", abortChild, { once: true });
      }

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        const normalized = stdout.replace(/\r/g, "").trim();
        if (normalized) {
          partials.push(normalized);
          onPartial?.(normalized);
        }
      });

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.on("error", (err) => {
        reject(new Error(`${err.message}${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
      });

      child.on("close", (code, _signal) => {
        const text = stdout.trim().replace(/\s+/g, " ");
        if (signal) signal.removeEventListener("abort", abortChild);
        if (code !== 0 && !signal?.aborted) {
          reject(new Error(stderr.trim() || `termux-speech-to-text exited with code ${code}`));
          return;
        }

        resolve({
          text,
          rawOutput: stdout,
          source: "termux-speech-to-text",
          durationMs: Date.now() - started,
          partials,
        });
      });
    });
  }
}
