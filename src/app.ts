import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiSdkTransport } from "./pi/transport.js";
import { TermuxSpeechToTextProvider } from "./providers/termux-stt.js";
import { TermuxTtsProvider, normalizeSpeechText } from "./providers/termux-tts.js";
import { renderScreen } from "./ui/tui.js";
import type { ControlCommand } from "./control/fifo.js";
import type { AppState, TtsMode } from "./types.js";

function nowStamp(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export class VoiceApp {
  private state: AppState = "BOOTING";
  private transcript = "";
  private draft = "";
  private response = "";
  private partial = "";
  private error = "";
  private sttAbort: AbortController | null = null;
  private captureActive = false;
  private captureQuietBursts = 0;
  private info: string[] = [];
  private history: string[] = [];
  private scroll = 0;
  private ttsMode: TtsMode = "OFF";
  private opToken = 0;
  private editingCursor = 0;
  private running = true;
  private piSessionId?: string;

  private readonly stt = new TermuxSpeechToTextProvider();
  private readonly tts = new TermuxTtsProvider();
  private readonly pi: PiSdkTransport;

  constructor(private readonly cwd: string) {
    this.pi = new PiSdkTransport(cwd);
  }

  async start(): Promise<void> {
    this.pushHistory("boot", "Initializing Pi transport…");
    this.render();
    try {
      await this.pi.waitReady();
      const info = await this.pi.getSessionInfo();
      this.piSessionId = info.sessionId;
      if (info.sessionFile) {
        this.pushHistory("pi", `session ${info.sessionId?.slice(0, 8) ?? "?"} ${info.sessionFile}`);
      } else {
        this.pushHistory("pi", `session ${info.sessionId?.slice(0, 8) ?? "?"}`);
      }
      this.setState("READY", "Press R or Space to speak.");
    } catch (err) {
      this.fail(`Pi init failed: ${errorMessage(err)}`);
    }
  }

  async dispose(): Promise<void> {
    this.running = false;
    await this.pi.dispose();
  }

  isRunning(): boolean {
    return this.running;
  }


  private setState(state: AppState, message?: string): void {
    this.state = state;
    if (message) this.info = [message];
    this.render();
  }

  private pushHistory(tag: string, message: string): void {
    this.history.push(`${nowStamp()} ${tag}: ${message}`);
    this.history = this.history.slice(-6);
  }

  private fail(message: string): void {
    this.error = message;
    this.state = "ERROR";
    this.pushHistory("error", message);
    this.render();
  }

  private clearError(): void {
    this.error = "";
  }

  private resetPrompt(): void {
    this.transcript = "";
    this.draft = "";
    this.response = "";
    this.partial = "";
    this.clearError();
    this.setState("READY", "Ready.");
  }

  private newOp(): number {
    this.opToken += 1;
    return this.opToken;
  }

  private active(token: number): boolean {
    return token === this.opToken;
  }

  private async beginCapture(): Promise<void> {
    if (this.captureActive || this.state === "SENDING" || this.state === "PI_WORKING") return;

    const token = this.newOp();
    this.captureActive = true;
    this.captureQuietBursts = 0;
    this.partial = "";
    this.clearError();
    this.response = "";
    this.draft = "";
    this.transcript = "";
    this.setState("LISTENING", "Listening… pauses are okay. Space stops.");
    void this.runCaptureSession(token);
  }

  private async runCaptureSession(token: number): Promise<void> {
    const segments: string[] = [];

    try {
      while (this.captureActive && this.active(token)) {
        this.sttAbort = new AbortController();
        this.state = "LISTENING";
        this.info = ["Listening… pauses are okay. Space stops."];
        this.render();

        const result = await this.stt.transcribe(this.sttAbort.signal, (partial) => {
          if (!this.active(token) || !this.captureActive) return;
          this.partial = partial;
          this.info = [`Heard: ${partial}`];
          this.render();
        });
        if (!this.active(token)) return;

        const text = result.text.trim().replace(/\s+/g, " ");
        if (text) {
          segments.push(text);
          this.transcript = segments.join(" ");
          this.draft = this.transcript;
          this.captureQuietBursts = 0;
          this.pushHistory("stt", `segment ${result.durationMs}ms`);
          this.info = ["Listening… pauses are okay. Space stops."];
          this.render();
        } else {
          this.captureQuietBursts += 1;
          this.pushHistory("stt", `pause ${result.durationMs}ms`);
          if (!segments.length && this.captureQuietBursts >= 3) {
            throw new Error(
              "Android speech recognition returned no transcript. Try again or check microphone permission.",
            );
          }
        }
      }

      if (!this.active(token)) return;
      if (this.transcript.trim()) {
        this.setState("CONFIRMING", "Transcript ready. Review before sending.");
      } else {
        this.setState("READY", "Stopped.");
      }
    } catch (err) {
      if (!this.active(token)) return;
      this.fail(`STT failed: ${errorMessage(err)}`);
    } finally {
      this.captureActive = false;
      if (this.sttAbort) this.sttAbort = null;
    }
  }

  private openEditor(): void {
    if (!this.transcript) return;
    this.clearError();
    this.draft = this.transcript;
    this.editingCursor = this.draft.length;
    this.setState("EDITING", "Edit the transcript, then Enter to save.");
  }

  private saveEdit(): void {
    this.transcript = this.draft.trim();
    this.response = "";
    this.pushHistory("edit", "Transcript updated.");
    this.setState("CONFIRMING", "Transcript updated. Enter to send.");
  }

  private cancelEdit(): void {
    this.draft = this.transcript;
    this.setState("CONFIRMING", "Edit cancelled.");
  }

  private async sendTranscript(): Promise<void> {
    const prompt = this.transcript.trim();
    if (!prompt) return;
    const token = this.newOp();
    this.clearError();
    this.response = "";
    this.setState("PI_WORKING", "Sending to Pi…");
    this.pushHistory("pi", "prompt sent");

    try {
      const result = await this.pi.prompt(prompt, (chunk) => {
        if (!this.active(token)) return;
        this.response += chunk;
        this.render();
      });
      if (!this.active(token)) return;

      this.response = result.text || this.response.trim();
      this.piSessionId = result.sessionId;
      this.pushHistory("pi", `done ${result.sessionId?.slice(0, 8) ?? ""}`.trim());
      this.setState("ANSWER_READY", "Answer ready.");
    } catch (err) {
      if (!this.active(token)) return;
      this.fail(`Pi failed: ${errorMessage(err)}`);
    }
  }

  private stopCapture(): void {
    this.captureActive = false;
    try {
      this.sttAbort?.abort();
    } catch {
      // ignore
    }
    if (this.state === "LISTENING" || this.state === "TRANSCRIBING") {
      this.info = ["Stopping… finalizing transcript."];
      this.render();
    }
  }

  private async abortCurrent(): Promise<void> {
    this.newOp();
    this.stopCapture();
    try {
      await this.pi.abort();
    } catch {
      // ignore
    }
    if (this.state === "LISTENING" || this.state === "TRANSCRIBING" || this.state === "SENDING" || this.state === "PI_WORKING") {
      this.pushHistory("abort", "Current operation cancelled.");
    }
    this.setState("READY", "Cancelled.");
  }

  private async speakResponse(): Promise<void> {
    if (!this.response.trim()) return;
    if (this.ttsMode === "OFF") {
      this.pushHistory("tts", "TTS is OFF.");
      this.render();
      return;
    }
    try {
      const text = normalizeSpeechText(this.response);
      await this.tts.speak(text);
      this.pushHistory("tts", "Spoken.");
      this.render();
    } catch (err) {
      this.fail(`TTS failed: ${errorMessage(err)}`);
    }
  }

  private toggleTtsMode(): void {
    this.ttsMode = this.ttsMode === "OFF" ? "MANUAL" : "OFF";
    this.pushHistory("tts", `Mode: ${this.ttsMode}`);
    this.render();
  }

  private handleEditingKey(name: string | undefined, sequence: string): void {
    if (name === "escape") {
      this.cancelEdit();
      return;
    }
    if (name === "return") {
      this.saveEdit();
      return;
    }
    if (name === "left") {
      this.editingCursor = clamp(this.editingCursor - 1, 0, this.draft.length);
      this.render();
      return;
    }
    if (name === "right") {
      this.editingCursor = clamp(this.editingCursor + 1, 0, this.draft.length);
      this.render();
      return;
    }
    if (name === "home") {
      this.editingCursor = 0;
      this.render();
      return;
    }
    if (name === "end") {
      this.editingCursor = this.draft.length;
      this.render();
      return;
    }
    if (name === "backspace") {
      if (this.editingCursor > 0) {
        this.draft = this.draft.slice(0, this.editingCursor - 1) + this.draft.slice(this.editingCursor);
        this.editingCursor -= 1;
        this.render();
      }
      return;
    }
    if (name === "delete") {
      if (this.editingCursor < this.draft.length) {
        this.draft = this.draft.slice(0, this.editingCursor) + this.draft.slice(this.editingCursor + 1);
        this.render();
      }
      return;
    }
    if (sequence && sequence.length === 1 && sequence >= " ") {
      this.draft = this.draft.slice(0, this.editingCursor) + sequence + this.draft.slice(this.editingCursor);
      this.editingCursor += 1;
      this.render();
    }
  }

  onControlCommand(command: ControlCommand): void {
    switch (command) {
      case "TOGGLE":
        if (this.state === "LISTENING" || this.state === "TRANSCRIBING") this.stopCapture();
        else void this.beginCapture();
        return;
      case "SEND":
        if (this.state === "CONFIRMING") void this.sendTranscript();
        return;
      case "CLEAR":
        this.resetPrompt();
        return;
      case "SPEAK":
        void this.speakResponse();
        return;
      case "QUIT":
        void this.dispose().finally(() => process.exit(0));
        return;
    }
  }

  onKey(name: string | undefined, sequence: string, ctrl = false): void {
    if (!this.running) return;
    if (ctrl && name === "c") {
      void this.dispose().finally(() => process.exit(0));
      return;
    }

    if (this.state === "ERROR") {
      if (name === "r" || name === "space") {
        void this.beginCapture();
        return;
      }
      if (name === "return" || name === "escape" || name === "x") {
        this.resetPrompt();
      }
      return;
    }

    if (this.state === "EDITING") {
      this.handleEditingKey(name, sequence);
      return;
    }

    if (this.state === "LISTENING") {
      if (name === "r" || name === "space") {
        this.stopCapture();
      } else if (name === "escape" || name === "x") {
        void this.abortCurrent();
      }
      return;
    }

    if (this.state === "TRANSCRIBING") {
      if (name === "r" || name === "space") {
        this.stopCapture();
      } else if (name === "escape" || name === "x") {
        void this.abortCurrent();
      }
      return;
    }

    if (this.state === "PI_WORKING" || this.state === "SENDING") {
      if (name === "escape") {
        void this.abortCurrent();
      }
      return;
    }

    if (name === "up") {
      this.scroll = Math.min(this.scroll + 1, 1000);
      this.render();
      return;
    }
    if (name === "down") {
      this.scroll = Math.max(this.scroll - 1, 0);
      this.render();
      return;
    }

    switch (name) {
      case "r":
      case "space":
        if (this.state === "READY" || this.state === "ANSWER_READY" || this.state === "CONFIRMING" || this.state === "ERROR") {
          void this.beginCapture();
        }
        return;
      case "e":
        this.openEditor();
        return;
      case "enter":
        if (this.state === "CONFIRMING") void this.sendTranscript();
        else if (this.state === "ANSWER_READY") this.resetPrompt();
        return;
      case "x":
        this.resetPrompt();
        return;
      case "s":
        void this.speakResponse();
        return;
      case "t":
        this.toggleTtsMode();
        return;
      case "escape":
        void this.abortCurrent();
        return;
      default:
        return;
    }
  }

  private render(): void {
    const width = process.stdout.columns ?? 80;
    const height = process.stdout.rows ?? 24;
    const frame = renderScreen({
      state: this.state,
      transcript: this.transcript,
      draft: this.draft,
      response: this.response,
      history: this.history,
      error: this.error,
      info: this.info,
      recordingPath: join(tmpdir(), "voice-ui-audio.m4a"),
      piSessionId: this.piSessionId,
      ttsMode: this.ttsMode,
      scroll: this.scroll,
      width,
      height,
    });
    process.stdout.write(frame);
  }
}
