#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SESSION="assembly-pi-stack"
PROJECT="${ASSEMBLY_PI_PROJECT:-$HOME/assembly-pi}"
LIMIT="${ASSEMBLY_PI_PICKER_LIMIT:-20}"
GUI_CMD='sleep 2; ./scripts/assembly-pi-gui.py; echo; echo GUI closed. Press Enter to relaunch.; read _; exec ./scripts/assembly-pi-gui.py'

if [ ! -d "$PROJECT" ]; then
  echo "Assembly Pi project not found: $PROJECT" >&2
  exit 1
fi

cd "$PROJECT"

mapfile -t SESSION_ROWS < <(python3 - "$LIMIT" <<'PY'
import glob
import json
import os
import sys
from datetime import datetime

limit = int(sys.argv[1])
home = os.path.expanduser("~")
files = glob.glob(os.path.join(home, ".pi", "agent", "sessions", "**", "*.jsonl"), recursive=True)
files.sort(key=lambda p: os.path.getmtime(p), reverse=True)


def text_from_content(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
        return " ".join(parts)
    return ""

rows = []
for path in files:
    try:
        with open(path, "r", encoding="utf-8") as f:
            header = json.loads(f.readline())
            session_id = str(header.get("id", "unknown"))
            cwd = str(header.get("cwd", ""))
            snippet = ""
            for line in f:
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if obj.get("type") != "message":
                    continue
                message = obj.get("message") or {}
                if message.get("role") == "user":
                    text = " ".join(text_from_content(message.get("content", "")).split())
                    if text:
                        snippet = text
            if not snippet:
                snippet = "(no user prompt yet)"
            if len(snippet) > 96:
                snippet = snippet[:93] + "..."
            modified = datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%d %H:%M")
            rows.append((session_id, modified, cwd, snippet, path))
    except Exception:
        continue
    if len(rows) >= limit:
        break

for i, (session_id, modified, cwd, snippet, path) in enumerate(rows, start=1):
    print("\t".join([str(i), session_id, modified, cwd, snippet, path]))
PY
)

if [ "${#SESSION_ROWS[@]}" -eq 0 ]; then
  echo "No Pi sessions found under ~/.pi/agent/sessions" >&2
  exit 1
fi

echo "♠️🌿🎸🧵 Assembly Pi Session Picker"
echo
for row in "${SESSION_ROWS[@]}"; do
  IFS=$'\t' read -r idx sid modified cwd snippet path <<<"$row"
  printf '[%s] %s  %s\n' "$idx" "${sid:0:8}" "$modified"
  printf '    cwd: %s\n' "$cwd"
  printf '    %s\n' "$snippet"
  printf '    %s\n\n' "$path"
done

read -r -p "Choose session number, paste session id/path, or Enter for latest: " choice
choice="${choice:-1}"

SELECTED=""
if [[ "$choice" =~ ^[0-9]+$ ]]; then
  if [ "$choice" -lt 1 ] || [ "$choice" -gt "${#SESSION_ROWS[@]}" ]; then
    echo "Choice out of range: $choice" >&2
    exit 1
  fi
  IFS=$'\t' read -r _ _ _ _ _ SELECTED <<<"${SESSION_ROWS[$((choice - 1))]}"
elif [ -f "$choice" ]; then
  SELECTED="$choice"
else
  for row in "${SESSION_ROWS[@]}"; do
    IFS=$'\t' read -r _ sid _ _ _ path <<<"$row"
    if [[ "$sid" == "$choice" || "$sid" == "$choice"* ]]; then
      SELECTED="$path"
      break
    fi
  done
fi

if [ -z "$SELECTED" ] || [ ! -f "$SELECTED" ]; then
  echo "Could not resolve session: $choice" >&2
  exit 1
fi

# Do not let another Assembly Pi backend fight over the same FIFO.
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux kill-session -t assembly-pi 2>/dev/null || true

tmux new-session -d -s "$SESSION" -n voice -c "$PROJECT" "ASSEMBLY_PI_SESSION='$SELECTED' npm run dev"
tmux split-window -h -t "$SESSION:voice" -c "$PROJECT" "$GUI_CMD"
tmux select-layout -t "$SESSION:voice" even-horizontal >/dev/null
tmux select-pane -t "$SESSION:voice.0"

echo
echo "Started tmux session '$SESSION' with selected Pi session:"
echo "$SELECTED"
echo
echo "Attach with: tmux attach -t $SESSION"
echo "Detach with: Ctrl+b then d"
