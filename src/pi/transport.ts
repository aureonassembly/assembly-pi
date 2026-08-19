import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import type { PiResult, PiTransport } from "../types.js";

export class PiSdkTransport implements PiTransport {
  private readonly ready: Promise<void>;
  private session: Awaited<ReturnType<typeof createAgentSession>>["session"] | null = null;
  private active = false;

  constructor(private readonly cwd: string) {
    this.ready = this.init();
  }

  async waitReady(): Promise<void> {
    await this.ready;
  }

  private async init(): Promise<void> {
    const { session, modelFallbackMessage } = await createAgentSession({
      cwd: this.cwd,
      sessionManager: SessionManager.continueRecent(this.cwd),
      thinkingLevel: "off",
    });

    this.session = session;
    if (modelFallbackMessage) {
      process.stderr.write(`[pi] ${modelFallbackMessage}\n`);
    }
  }

  async prompt(text: string, onDelta?: (chunk: string) => void): Promise<PiResult> {
    await this.ready;
    if (!this.session) throw new Error("Pi session not initialized");

    let responseText = "";
    const unsubscribe = this.session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        responseText += event.assistantMessageEvent.delta;
        onDelta?.(event.assistantMessageEvent.delta);
      }
    });

    try {
      this.active = true;
      await this.session.prompt(text);
      return {
        text: responseText.trim(),
        sessionId: this.session.sessionId,
        sessionFile: this.session.sessionFile,
      };
    } finally {
      this.active = false;
      unsubscribe();
    }
  }

  async abort(): Promise<void> {
    await this.ready;
    if (this.session && this.active) {
      await this.session.abort();
    }
  }

  async dispose(): Promise<void> {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
  }
}
