import type { AppState, TtsMode } from "../types.js";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  clear: "\x1b[2J",
  home: "\x1b[H",
  hide: "\x1b[?25l",
  show: "\x1b[?25h",
};

export interface RenderState {
  state: AppState;
  transcript: string;
  draft: string;
  response: string;
  history: string[];
  error?: string;
  info?: string[];
  recordingPath?: string;
  piSessionId?: string;
  ttsMode: TtsMode;
  scroll: number;
  width: number;
  height: number;
}

function colorForState(state: AppState): string {
  switch (state) {
    case "READY":
      return C.green;
    case "LISTENING":
    case "TRANSCRIBING":
      return C.cyan;
    case "CONFIRMING":
    case "EDITING":
      return C.yellow;
    case "SENDING":
    case "PI_WORKING":
      return C.magenta;
    case "ANSWER_READY":
      return C.blue;
    case "ERROR":
      return C.red;
    case "BOOTING":
    default:
      return C.dim;
  }
}

function stripControl(text: string): string {
  return text.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "");
}

function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  const safeWidth = Math.max(10, width);
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripControl(rawLine);
    if (!line) {
      out.push("");
      continue;
    }
    let current = "";
    for (const word of line.split(/\s+/)) {
      if (!word) continue;
      if (!current) {
        if (word.length <= safeWidth) {
          current = word;
        } else {
          for (let i = 0; i < word.length; i += safeWidth) {
            out.push(word.slice(i, i + safeWidth));
          }
        }
        continue;
      }
      if (current.length + 1 + word.length <= safeWidth) {
        current += ` ${word}`;
      } else {
        out.push(current);
        if (word.length <= safeWidth) {
          current = word;
        } else {
          current = "";
          for (let i = 0; i < word.length; i += safeWidth) {
            const part = word.slice(i, i + safeWidth);
            if (part.length === safeWidth) out.push(part);
            else current = part;
          }
        }
      }
    }
    if (current) out.push(current);
  }
  return out;
}

function section(title: string, body: string, width: number): string[] {
  const lines = wrapText(body, width - 2);
  return [`${C.bold}${title}${C.reset}`, ...lines.map((line) => `  ${line}`)];
}

function padRight(text: string, width: number): string {
  const plain = stripControl(text);
  if (plain.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - plain.length);
}

function buildControls(state: AppState, ttsMode: TtsMode): string {
  switch (state) {
    case "READY":
      return "R/Space record   E edit last   X clear   S speak answer   ↑↓ scroll   Ctrl+C quit";
    case "LISTENING":
      return "R/Space stop     pauses okay   Ctrl+C quit";
    case "TRANSCRIBING":
      return "Finalizing...    pauses okay   Ctrl+C quit";
    case "CONFIRMING":
      return "Enter send       E edit       R retry record   X cancel   Ctrl+C quit";
    case "EDITING":
      return "Enter save       Esc cancel    Ctrl+C quit";
    case "SENDING":
    case "PI_WORKING":
      return "Please wait...   Esc abort    Ctrl+C quit";
    case "ANSWER_READY":
      return `S speak (${ttsMode})   R new prompt   E edit transcript   X clear   Ctrl+C quit`;
    case "ERROR":
      return "Enter dismiss    R retry      Ctrl+C quit";
    case "BOOTING":
    default:
      return "Initializing...  Ctrl+C quit";
  }
}

export function renderScreen(state: RenderState): string {
  const w = Math.max(40, state.width || 80);
  const h = Math.max(20, state.height || 24);
  const title = `${C.bold}PI VOICE UI${C.reset}`;
  const stateLabel = `${colorForState(state.state)}${state.state}${C.reset}`;
  const header = `${title}  ${C.dim}(${stateLabel})${C.reset}`;
  const infoBits = [
    state.piSessionId ? `Pi:${state.piSessionId.slice(0, 8)}` : "Pi:pending",
    `TTS:${state.ttsMode}`,
    state.recordingPath ? `Rec:${state.recordingPath.split("/").pop()}` : null,
  ].filter(Boolean).join("  ");

  const lines: string[] = [];
  lines.push(header);
  lines.push(C.dim + infoBits + C.reset);
  lines.push("");

  for (const note of state.info ?? []) {
    lines.push(`${C.dim}${note}${C.reset}`);
  }

  if (state.error) {
    lines.push(`${C.red}${C.bold}Error:${C.reset} ${state.error}`);
  }

  if (state.state === "LISTENING") {
    lines.push(`${C.cyan}${C.bold}Recording…${C.reset}`);
    lines.push(`Speak at your own pace. Short pauses are okay; Space stops.`);
  }

  if (state.state === "TRANSCRIBING") {
    lines.push(`${C.cyan}${C.bold}Transcribing…${C.reset}`);
    lines.push(`Android STT may restart on silence until you press Space.`);
  }

  if (state.state === "CONFIRMING" || state.state === "EDITING" || state.state === "ANSWER_READY" || state.state === "SENDING" || state.state === "PI_WORKING") {
    lines.push(`${C.bold}Transcript${C.reset}`);
    lines.push(`  ${state.state === "EDITING" ? state.draft : state.transcript}`.trimEnd());
    lines.push("");
  }

  if (state.state === "EDITING") {
    lines.push(`${C.bold}Edit${C.reset}`);
    lines.push(`  ${state.draft}`);
  }

  if (state.state === "ANSWER_READY" || state.state === "SENDING" || state.state === "PI_WORKING") {
    lines.push(`${C.bold}Pi response${C.reset}`);
    lines.push(`  ${state.response || `${C.dim}(waiting for response…)${C.reset}`}`);
  }

  if (state.history.length) {
    lines.push("");
    lines.push(`${C.bold}Session${C.reset}`);
    for (const item of state.history) {
      lines.push(`  ${item}`);
    }
  }

  if (state.state === "READY" && state.transcript) {
    lines.push("");
    lines.push(`${C.bold}Last transcript${C.reset}`);
    lines.push(`  ${state.transcript}`);
  }

  if (state.state === "READY" && state.response) {
    lines.push("");
    lines.push(`${C.bold}Last answer${C.reset}`);
    lines.push(`  ${state.response}`);
  }

  const controls = buildControls(state.state, state.ttsMode);
  lines.push("");
  lines.push(`${C.dim}${controls}${C.reset}`);

  const visible = lines.flatMap((line) => wrapText(line, w));
  const bodyHeight = Math.max(1, h - 2);
  const start = Math.max(0, visible.length - bodyHeight - Math.max(0, state.scroll));
  const end = Math.min(visible.length, start + bodyHeight);
  const shown = visible.slice(start, end);
  while (shown.length < bodyHeight) shown.push("");

  return [C.clear, C.home, C.hide, ...shown.map((line) => padRight(line, w)), C.show].join("\n");
}
