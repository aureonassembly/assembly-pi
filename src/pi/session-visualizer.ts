import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { execSync } from "node:child_process";

const VISUALIZATION_FILENAME = "assembly-pi-session-visualization.html";
const GITHUB_REPO_URL = "https://github.com/aureonassembly/assembly-pi";
const GITHUB_MAIN_URL = `${GITHUB_REPO_URL}/tree/main`;

function publicAndroidDownloads(): string | undefined {
  const candidates = [
    process.env.ASSEMBLY_PI_VISUALIZATION_DIR,
    "/storage/emulated/0/Download",
    "/sdcard/Download",
  ].filter(Boolean) as string[];

  return candidates.find((path) => existsSync(path));
}

function defaultVisualizationPath(): string {
  const home = process.env.HOME ?? ".";
  const publicDownloads = publicAndroidDownloads();
  if (publicDownloads) return join(publicDownloads, VISUALIZATION_FILENAME);
  const termuxDownloads = join(home, "storage/downloads");
  if (existsSync(termuxDownloads)) return join(termuxDownloads, VISUALIZATION_FILENAME);
  return join(home, VISUALIZATION_FILENAME);
}

function toFileUri(path: string): string {
  return `file://${resolve(path).replace(/\\/g, "/")}`;
}

function localHttpUri(path: string): string | undefined {
  const resolved = resolve(path).replace(/\\/g, "/");
  if (!resolved.endsWith("/Download/assembly-pi-session-visualization.html")) return undefined;
  return "http://127.0.0.1:8765/assembly-pi-session-visualization.html";
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

function linkifyEscapedText(value: string): string {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)#(\d{1,6})(?=\s|\.|,|:|;|\)|$)/g, `$1<a href="${GITHUB_REPO_URL}/issues/$2" target="_blank" rel="noopener">#$2</a>`)
    .replace(/(\/data\/data\/com\.termux\/files\/home\/\.pi\/agent\/sessions\/[^\s<]+)/g, '<a href="file://$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(\/storage\/emulated\/0\/Download\/[^\s<]+)/g, '<a href="file://$1" target="_blank" rel="noopener">$1</a>');
}

function shortPath(path: string): string {
  const home = process.env.HOME;
  if (home && path.startsWith(home)) return `~${path.slice(home.length)}`;
  return path;
}

function excerpt(value: string | undefined, maxChars: number): string | undefined {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function limitWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/);
  if (words.length <= maxWords) return value;
  return `${words.slice(0, maxWords).join(" ")}…`;
}

function currentStateSummary(parsed: ReturnType<typeof parseSession>, git: ReturnType<typeof gitInfo>, latestUser?: string, latestAssistant?: string): string {
  const userLine = excerpt(latestUser, 70) ?? "waiting for the next user direction";
  const assistantLine = excerpt(latestAssistant, 70) ?? "no assistant response yet";
  return limitWords(
    `We are refining Assembly Pi issue ${git.issue}: the Android session visualization should feel live, readable, and trustworthy. It is generated from the current session file with ${parsed.entries.length} entries. Latest user direction: ${userLine}. Latest output: ${assistantLine}. Next step: regenerate and test in the GUI.`,
    62,
  );
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

function gitInfo(): { branch: string; commit: string; remote: string; issue: string; issueUrl: string; branchUrl: string; commitUrl: string } {
  const run = (cmd: string, fallback = "unknown") => {
    try {
      return execSync(cmd, { encoding: "utf8" }).trim() || fallback;
    } catch {
      return fallback;
    }
  };
  const project = process.env.ASSEMBLY_PI_PROJECT_DIR ?? "/data/data/com.termux/files/home/assembly-pi";
  const branch = run(`git -C ${JSON.stringify(project)} rev-parse --abbrev-ref HEAD`);
  const commit = run(`git -C ${JSON.stringify(project)} rev-parse --short HEAD`);
  const remote = run(`git -C ${JSON.stringify(project)} remote get-url origin`, GITHUB_REPO_URL);
  const issueNumber = branch.match(/^(\d+)-/)?.[1] ?? "1";
  const issue = `#${issueNumber}`;
  return {
    branch,
    commit,
    remote,
    issue,
    issueUrl: `${GITHUB_REPO_URL}/issues/${issueNumber}`,
    branchUrl: `${GITHUB_REPO_URL}/tree/${encodeURIComponent(branch)}`,
    commitUrl: `${GITHUB_REPO_URL}/commit/${encodeURIComponent(commit)}`,
  };
}

function renderHtml(sessionFile: string, outputPath: string, parsed: ReturnType<typeof parseSession>): string {
  const userCount = parsed.entries.filter((e) => e.role === "user").length;
  const assistantCount = parsed.entries.filter((e) => e.role === "assistant").length;
  const toolCount = parsed.entries.filter((e) => e.role === "toolResult").length;
  const sourceUri = toFileUri(sessionFile);
  const outputUri = toFileUri(outputPath);
  const httpUri = localHttpUri(outputPath);
  const git = gitInfo();
  const generatedAt = new Date().toLocaleString();
  const latestUserFull = [...parsed.entries].reverse().find((e) => e.role === "user")?.text.trim();
  const latestAssistantFull = [...parsed.entries].reverse().find((e) => e.role === "assistant")?.text.trim();
  const latestUser = excerpt(latestUserFull, 700);
  const latestAssistant = excerpt(latestAssistantFull, 900);
  const stateSummary = currentStateSummary(parsed, git, latestUserFull, latestAssistantFull);

  const cards = parsed.entries
    .map((entry, index) => {
      const time = timestampLabel(entry.timestamp);
      const meta = `<div class="meta"><span class="badge">${escapeHtml(entry.title)}</span><span class="turn">#${index + 1}</span>${time ? `<time>${escapeHtml(time)}</time>` : ""}</div>`;
      if (entry.role === "toolResult") {
        const preview = entry.text.replace(/\s+/g, " ").trim().slice(0, 180) || "tool output";
        return `<article class="card ${entry.role}">
  ${meta}
  <details class="tool-details"><summary>Terminal/tool output hidden by default — ${escapeHtml(preview)}${entry.text.length > 180 ? "…" : ""}</summary>
  <div class="entry-text">${linkifyEscapedText(entry.text)}</div>
  </details>
</article>`;
      }
      return `<article class="card ${entry.role}">
  ${meta}
  <div class="entry-text">${linkifyEscapedText(entry.text)}</div>
</article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Assembly Pi Current Session</title>
<style>
:root {
  color-scheme: dark;
  --bg:#050816; --bg2:#0f172a; --panel:rgba(15,23,42,.82); --panel2:rgba(30,41,59,.72);
  --text:#e2e8f0; --muted:#94a3b8; --faint:#64748b; --edge:rgba(148,163,184,.24);
  --cyan:#06b6d4; --sky:#38bdf8; --green:#10b981; --amber:#f59e0b; --rose:#fb7185; --violet:#a78bfa;
  --nyro:#7dd3fc; --aureon:#86efac; --jamai:#fbbf24; --synth:#c084fc;
}
* { box-sizing:border-box; }
html { scrollbar-color: var(--green) rgba(15,23,42,.75); scrollbar-width: auto; }
::-webkit-scrollbar { width: 18px; height: 18px; }
::-webkit-scrollbar-track { background: rgba(15,23,42,.85); border-left:1px solid var(--edge); }
::-webkit-scrollbar-thumb { background: linear-gradient(180deg,var(--green),var(--cyan),var(--violet)); border-radius:999px; border:4px solid rgba(15,23,42,.95); }
body {
  margin:0; min-height:100vh; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at 15% 0%, rgba(16,185,129,.22), transparent 34%),
    radial-gradient(circle at 84% 8%, rgba(6,182,212,.22), transparent 32%),
    radial-gradient(circle at 50% 100%, rgba(167,139,250,.18), transparent 38%),
    linear-gradient(180deg, var(--bg), #020617 58%, #030712);
  color:var(--text); line-height:1.5;
}
a { color:#67e8f9; text-decoration:none; border-bottom:1px solid rgba(103,232,249,.35); }
a:hover { color:white; border-bottom-color:white; }
header { position:sticky; top:0; z-index:4; padding:14px 14px 12px; background:rgba(2,6,23,.91); border-bottom:1px solid var(--edge); backdrop-filter: blur(12px); }
.shell { max-width:1100px; margin:0 auto; }
.brand { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
h1 { margin:0; font-size:1.24rem; color:white; letter-spacing:.01em; }
.subtitle { margin:4px 0 0; color:var(--muted); font-size:.88rem; }
.pillrow { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
.pill { display:inline-flex; align-items:center; gap:6px; max-width:100%; padding:7px 10px; border:1px solid var(--edge); border-radius:999px; background:rgba(15,23,42,.72); color:var(--muted); font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:.78rem; overflow-wrap:anywhere; }
.pill.strong { color:#ecfeff; border-color:rgba(6,182,212,.48); background:rgba(6,182,212,.12); }
.grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin:14px auto; max-width:1100px; padding:0 12px; }
.panel { border:1px solid var(--edge); border-radius:18px; background:linear-gradient(135deg, rgba(15,23,42,.8), rgba(15,23,42,.42)); box-shadow:0 10px 30px rgba(0,0,0,.28); padding:13px; }
.panel h2 { margin:0 0 8px; font-size:.86rem; color:#e0f2fe; text-transform:uppercase; letter-spacing:.12em; }
.kv { display:grid; grid-template-columns:auto 1fr; gap:6px 10px; font-size:.83rem; }
.kv b { color:var(--faint); font-weight:600; }
.kv span { overflow-wrap:anywhere; }
.latest { color:#d1fae5; font-size:.9rem; }
.now { color:#ecfeff; font-size:.95rem; line-height:1.55; padding:11px 12px; border-radius:14px; border:1px solid rgba(16,185,129,.30); background:linear-gradient(135deg, rgba(16,185,129,.14), rgba(6,182,212,.10)); }
.output { color:#dbeafe; font-size:.9rem; white-space:pre-wrap; overflow-wrap:anywhere; }
main { padding:0 12px 20px; max-width:1100px; margin:0 auto; }
.card { margin:12px 0; padding:13px; border-radius:18px; box-shadow:0 8px 24px rgba(0,0,0,.24); border:1px solid rgba(255,255,255,.09); overflow:hidden; }
.card.user { background:linear-gradient(135deg, rgba(16,185,129,.26), rgba(5,46,22,.72)); border-color:rgba(16,185,129,.34); }
.card.assistant { background:linear-gradient(135deg, rgba(6,182,212,.22), rgba(30,58,138,.68)); border-color:rgba(56,189,248,.30); }
.card.toolResult { background:linear-gradient(135deg, rgba(245,158,11,.18), rgba(28,25,23,.78)); border-color:rgba(245,158,11,.28); }
.card.system { background:linear-gradient(135deg, rgba(167,139,250,.18), rgba(24,24,27,.80)); border-color:rgba(167,139,250,.25); }
.meta { display:flex; gap:9px; align-items:center; flex-wrap:wrap; color:var(--muted); margin-bottom:9px; font-size:.78rem; }
.badge { color:white; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
.turn { color:#bef264; }
.entry-text { white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.92rem; }
.tool-details summary { cursor:pointer; color:#fde68a; list-style:none; padding:10px 12px; border-radius:12px; background:rgba(15,23,42,.55); border:1px dashed rgba(245,158,11,.34); }
.tool-details summary::-webkit-details-marker { display:none; }
.tool-details[open] summary { margin-bottom:10px; }
.empty { color:var(--muted); text-align:center; padding:40px 12px; border:1px dashed var(--edge); border-radius:18px; }
footer { color:var(--muted); padding:10px 12px 46px; text-align:center; font-size:.8rem; overflow-wrap:anywhere; }
@media (max-width:720px) {
  header { position:relative; }
  .grid { grid-template-columns:1fr; }
  .pill { width:100%; border-radius:14px; }
  .entry-text { font-size:.9rem; }
}
</style>
</head>
<body>
<header>
  <div class="shell">
    <div class="brand">
      <div>
        <h1>♠️🌿🎸🧵 Assembly Pi — Current Session</h1>
        <p class="subtitle">Generated from the live session file. No mock cards, no stale issue block.</p>
      </div>
      <span class="pill strong">${escapeHtml(git.issue)} live branch</span>
    </div>
    <div class="pillrow">
      <span class="pill strong">Session ${escapeHtml(parsed.sessionId ?? "unknown")}</span>
      <span class="pill">User ${userCount}</span>
      <span class="pill">Assistant ${assistantCount}</span>
      <span class="pill">Tools ${toolCount}</span>
      <span class="pill">Entries ${parsed.entries.length}</span>
    </div>
  </div>
</header>
<section class="grid">
  <div class="panel">
    <h2>Session source of truth</h2>
    <div class="kv">
      <b>CWD</b><span>${escapeHtml(parsed.cwd ?? "unknown")}</span>
      <b>Session file</b><span><a href="${escapeHtml(sourceUri)}">${escapeHtml(shortPath(sessionFile))}</a></span>
      <b>HTML file</b><span><a href="${escapeHtml(outputUri)}">${escapeHtml(shortPath(outputPath))}</a></span>
      ${httpUri ? `<b>Phone URL</b><span><a href="${escapeHtml(httpUri)}">${escapeHtml(httpUri)}</a></span>` : ""}
      <b>Generated</b><span>${escapeHtml(generatedAt)}</span>
    </div>
  </div>
  <div class="panel">
    <h2>Decision links</h2>
    <div class="kv">
      <b>Repo</b><span><a href="${GITHUB_REPO_URL}">assembly-pi</a> · <a href="${GITHUB_MAIN_URL}">main</a></span>
      <b>Branch</b><span><a href="${escapeHtml(git.branchUrl)}">${escapeHtml(git.branch)}</a></span>
      <b>Commit</b><span><a href="${escapeHtml(git.commitUrl)}">${escapeHtml(git.commit)}</a></span>
      <b>Issue</b><span><a href="${escapeHtml(git.issueUrl)}">${escapeHtml(git.issue)} current-session visualization</a></span>
      <b>Remote</b><span><a href="${escapeHtml(git.remote)}">origin</a></span>
    </div>
  </div>
  <div class="panel" style="grid-column:1 / -1">
    <h2>Current state — about 55 words</h2>
    <div class="now">${linkifyEscapedText(stateSummary)}</div>
  </div>
  <div class="panel">
    <h2>Last user prompt</h2>
    <div class="latest">${latestUser ? linkifyEscapedText(latestUser) : "No user prompt found yet."}</div>
  </div>
  <div class="panel">
    <h2>Last session output</h2>
    <div class="output">${latestAssistant ? linkifyEscapedText(latestAssistant) : "No assistant output found yet."}</div>
  </div>
</section>
<main>
${cards || '<div class="empty">No messages found in this session file yet.</div>'}
</main>
<footer>Source: <a href="${escapeHtml(sourceUri)}">${escapeHtml(sessionFile)}</a><br/>Generated: ${escapeHtml(generatedAt)}</footer>
</body>
</html>`;
}

export async function generateSessionVisualization(sessionFile: string, outputPath = SESSION_VISUALIZATION_PATH): Promise<string> {
  const content = await readFile(sessionFile, "utf8");
  const parsed = parseSession(content);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderHtml(sessionFile, outputPath, parsed), "utf8");
  await writeFile(join(dirname(outputPath), ".last-visualization-path"), outputPath + "\n", "utf8");
  return outputPath;
}
