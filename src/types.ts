export type AppState =
  | "BOOTING"
  | "READY"
  | "LISTENING"
  | "TRANSCRIBING"
  | "CONFIRMING"
  | "EDITING"
  | "SENDING"
  | "PI_WORKING"
  | "ANSWER_READY"
  | "ERROR";

export type TtsMode = "OFF" | "MANUAL" | "AUTO";

export interface TranscriptResult {
  text: string;
  rawOutput: string;
  source: string;
  durationMs: number;
  partials: string[];
}

export interface STTProvider {
  transcribe(
    signal?: AbortSignal,
    onPartial?: (partial: string) => void,
  ): Promise<TranscriptResult>;
}

export interface TTSProvider {
  speak(text: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}

export interface RecordingSession {
  path: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRecording(): boolean;
}

export interface PiResult {
  text: string;
  sessionId?: string;
  sessionFile?: string;
}

export interface PiSessionInfo {
  sessionId?: string;
  sessionFile?: string;
}

export interface PiTransport {
  getSessionInfo(): Promise<PiSessionInfo>;
  prompt(text: string, onDelta?: (chunk: string) => void): Promise<PiResult>;
  abort(): Promise<void>;
  dispose(): Promise<void>;
}
