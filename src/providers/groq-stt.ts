import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TermuxMicrophoneRecordingSession } from "../voice/controller.js";
import type { STTProvider, TranscriptResult } from "../types.js";

function groqApiKey(): string | undefined {
  return process.env.GROQ_API_KEY?.trim();
}

async function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (!signal) return;
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

export class GroqSpeechToTextProvider implements STTProvider {
  async transcribe(signal?: AbortSignal, onPartial?: (partial: string) => void): Promise<TranscriptResult> {
    const key = groqApiKey();
    if (!key) {
      throw new Error("GROQ_API_KEY is not set. Run: export GROQ_API_KEY='your_key' before starting assembly-pi.");
    }

    const started = Date.now();
    const audioPath = join(tmpdir(), `assembly-pi-${Date.now()}.m4a`);
    const recorder = new TermuxMicrophoneRecordingSession(audioPath);

    onPartial?.("recording locally…");
    await recorder.start();
    await waitForAbort(signal);
    onPartial?.("stopping recording…");
    await recorder.stop();

    try {
      onPartial?.("uploading to Groq Whisper…");
      const audio = await readFile(audioPath);
      const form = new FormData();
      form.append("file", new Blob([audio], { type: "audio/mp4" }), "recording.m4a");
      form.append("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
      form.append("response_format", "json");

      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
        },
        body: form,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Groq STT failed ${response.status}: ${body.slice(0, 500)}`);
      }

      const json = await response.json() as { text?: string };
      const text = (json.text ?? "").trim().replace(/\s+/g, " ");
      return {
        text,
        rawOutput: JSON.stringify(json),
        source: `groq:${process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo"}`,
        durationMs: Date.now() - started,
        partials: [],
      };
    } finally {
      await unlink(audioPath).catch(() => undefined);
    }
  }
}
