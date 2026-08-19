import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";

async function listMarkdownCommands(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of await readdir(dir).catch(() => [])) {
    const path = join(dir, entry);
    const s = await stat(path).catch(() => undefined);
    if (!s?.isFile() || !entry.endsWith(".md")) continue;
    out.push(`/${basename(entry, ".md")}  prompt template`);
  }
  return out;
}

async function listSkillCommands(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of await readdir(dir).catch(() => [])) {
    const path = join(dir, entry);
    const s = await stat(path).catch(() => undefined);
    if (!s?.isDirectory()) continue;
    if (existsSync(join(path, "SKILL.md"))) {
      out.push(`/skill:${entry}  skill`);
    }
  }
  return out;
}

export async function listLocalSlashCommands(cwd: string): Promise<string> {
  const home = process.env.HOME ?? cwd;
  const promptDirs = [join(home, ".pi/agent/prompts"), join(cwd, ".pi/prompts")];
  const skillDirs = [join(home, ".pi/agent/skills"), join(home, ".agents/skills"), join(cwd, ".pi/skills"), join(cwd, ".agents/skills")];

  const prompts = (await Promise.all(promptDirs.map(listMarkdownCommands))).flat();
  const skills = (await Promise.all(skillDirs.map(listSkillCommands))).flat();
  const unique = [...new Set([...prompts, ...skills])].sort();

  if (!unique.length) {
    return [
      "No local prompt-template or skill slash commands found.",
      "You can still type normal Pi slash commands if extensions provide them.",
      "TUI-only commands like /settings are not available in this custom GUI.",
    ].join("\n");
  }

  return [
    "Available local slash commands:",
    "",
    ...unique.map((line) => `- ${line}`),
    "",
    "Type one into the GUI prompt box and press SEND TYPED PROMPT TO PI.",
    "Note: TUI-only commands like /settings are not available here.",
  ].join("\n");
}
