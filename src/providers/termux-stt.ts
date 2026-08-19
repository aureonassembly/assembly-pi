import { spawn } from "node:child_process";
import { TranscriptResult, type STTProvider } from "../types.js";

export class TermuxSpeechToTextProvider implements STTProvider {
  async transcribe(onPartial?: (partial: string) => void): Promise<TranscriptResult> {
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

      child.on("error", reject);

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
