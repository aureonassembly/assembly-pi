import { spawn } from "node:child_process";
import { TranscriptResult, type STTProvider } from "../types.js";

export class TermuxSpeechToTextProvider implements STTProvider {
  async transcribe(onPartial?: (partial: string) => void): Promise<TranscriptResult> {
    return await this.runWithRetry(onPartial, 2);
  }

  private async runWithRetry(onPartial: ((partial: string) => void) | undefined, attempts: number): Promise<TranscriptResult> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await this.runOnce(onPartial);
        if (!result.text.trim()) {
          throw new Error(
            "termux-speech-to-text returned no transcript. If this persists, confirm Android microphone permission and test in an interactive Termux session.",
          );
        }
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }
    }

    throw lastError ?? new Error("termux-speech-to-text failed without a detailed error");
  }

  private async runOnce(onPartial: ((partial: string) => void) | undefined): Promise<TranscriptResult> {
    const started = Date.now();
    const partials: string[] = [];
    let stdout = "";
    let stderr = "";

    return await new Promise<TranscriptResult>((resolve, reject) => {
      const child = spawn("termux-speech-to-text", [], {
        stdio: ["ignore", "pipe", "pipe"],
      });

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

      child.on("close", (code) => {
        const text = stdout.trim().replace(/\s+/g, " ");
        if (code !== 0) {
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
