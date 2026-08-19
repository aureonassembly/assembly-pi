import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function defaultVisualizationPath(): string {
  const home = process.env.HOME ?? ".";
  const downloads = join(home, "storage/downloads");
  if (existsSync(downloads)) return join(downloads, "assembly-pi-session-visualization.html");
  return join(home, "assembly-pi-session-visualization.html");
}

export const SESSION_VISUALIZATION_PATH = defaultVisualizationPath();

type Role = "user" | "assistant" | "toolResult" | "system";

interface VisualEntry {
  role: Role;
  title: string;
  text: string;
  timestamp?: number | string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string") return p.text;
      if (typeof p.thinking === "string") return `[thinking] ${p.thinking}`;
      if (p.type === "toolCall") {
        return `[tool call: ${String(p.name ?? "tool")}]
${JSON.stringify(p.arguments ?? {}, null, 2)}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function timestampLabel(timestamp: unknown): string {
  if (typeof timestamp === "number") return new Date(timestamp).toLocaleString();
  if (typeof timestamp === "string") return new Date(timestamp).toLocaleString();
  return "";
}

function parseSession(jsonl: string): { sessionId?: string; cwd?: string; entries: VisualEntry[] } {
  const entries: VisualEntry[] = [];
  let sessionId: string | undefined;
  let cwd: string | undefined;

  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (obj.type === "session") {
      sessionId = typeof obj.id === "string" ? obj.id : sessionId;
      cwd = typeof obj.cwd === "string" ? obj.cwd : cwd;
      continue;
    }

    if (obj.type === "model_change") {
      entries.push({
        role: "system",
        title: "Model",
        text: `${String(obj.provider ?? "provider")}/${String(obj.modelId ?? "model")}`,
        timestamp: obj.timestamp as string | undefined,
      });
      continue;
    }

    if (obj.type !== "message") continue;
    const message = obj.message as Record<string, unknown> | undefined;
    if (!message) continue;
    const roleRaw = String(message.role ?? "system");
    const text = textFromContent(message.content);
    if (!text.trim()) continue;

    const role: Role = roleRaw === "user" || roleRaw === "assistant" || roleRaw === "toolResult" ? roleRaw : "system";
    const title = role === "toolResult" ? `Tool: ${String(message.toolName ?? "result")}` : role;
    entries.push({
      role,
      title,
      text,
      timestamp: (message.timestamp as number | undefined) ?? (obj.timestamp as string | undefined),
    });
  }

  return { sessionId, cwd, entries };
}

function renderHtml(sessionFile: string, parsed: ReturnType<typeof parseSession>): string {
  const userCount = parsed.entries.filter((e) => e.role === "user").length;
  const assistantCount = parsed.entries.filter((e) => e.role === "assistant").length;
  const toolCount = parsed.entries.filter((e) => e.role === "toolResult").length;

  const cards = parsed.entries
    .map((entry, index) => {
      const time = timestampLabel(entry.timestamp);
      return `<article class="card ${entry.role}">
  <div class="meta"><span class="badge">${escapeHtml(entry.title)}</span><span>${index + 1}</span><span>${escapeHtml(time)}</span></div>
  <pre>${escapeHtml(entry.text)}</pre>
</article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Assembly Pi Session Visualization</title>
<style>
:root { color-scheme: dark; --bg:#07111f; --panel:#101827; --text:#e5e7eb; --muted:#94a3b8; --user:#14532d; --assistant:#1e3a8a; --tool:#3b2f09; --system:#27272a; --accent:#38bdf8; }
* { box-sizing:border-box; }
body { margin:0; font-family: system-ui, sans-serif; background: radial-gradient(circle at top, #172554, var(--bg)); color:var(--text); }
header { position:sticky; top:0; z-index:2; padding:16px; background:rgba(7,17,31,.94); border-bottom:1px solid #334155; backdrop-filter: blur(8px); }
h1 { margin:0 0 8px; font-size:1.35rem; color:var(--accent); }
.stats { display:flex; flex-wrap:wrap; gap:8px; color:var(--muted); font-size:.9rem; }
.stat { padding:5px 9px; border:1px solid #334155; border-radius:999px; background:#0f172a; }
main { padding:12px; max-width:980px; margin:0 auto; }
.card { margin:12px 0; padding:12px; border-radius:16px; box-shadow: 0 8px 22px rgba(0,0,0,.25); border:1px solid rgba(255,255,255,.08); }
.card.user { background:linear-gradient(135deg, var(--user), #052e16); }
.card.assistant { background:linear-gradient(135deg, var(--assistant), #172554); }
.card.toolResult { background:linear-gradient(135deg, var(--tool), #1c1917); }
.card.system { background:linear-gradient(135deg, var(--system), #18181b); }
.meta { display:flex; gap:10px; align-items:center; color:var(--muted); margin-bottom:8px; font-size:.82rem; }
.badge { color:white; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
pre { margin:0; white-space:pre-wrap; word-wrap:break-word; line-height:1.45; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.92rem; }
footer { color:var(--muted); padding:20px 12px 40px; text-align:center; font-size:.82rem; }
</style>
</head>
<body>
<header>
  <h1>Assembly Pi Session Visualization</h1>
  <div class="stats">
    <span class="stat">Session: ${escapeHtml(parsed.sessionId ?? "unknown")}</span>
    <span class="stat">User: ${userCount}</span>
    <span class="stat">Assistant: ${assistantCount}</span>
    <span class="stat">Tools: ${toolCount}</span>
    <span class="stat">Entries: ${parsed.entries.length}</span>
  </div>
  <div class="stats" style="margin-top:8px"><span class="stat">cwd: ${escapeHtml(parsed.cwd ?? "")}</span></div>
</header>
<main>
${cards || "<p>No messages found.</p>"}
</main>
<footer>Source: ${escapeHtml(sessionFile)}<br/>Generated: ${escapeHtml(new Date().toLocaleString())}</footer>
</body>
</html>`;
}

export async function generateSessionVisualization(sessionFile: string, outputPath = SESSION_VISUALIZATION_PATH): Promise<string> {
  const content = await readFile(sessionFile, "utf8");
  const parsed = parseSession(content);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderHtml(sessionFile, parsed), "utf8");
  return outputPath;
}
