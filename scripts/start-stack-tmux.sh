#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SESSION="assembly-pi-stack"
PROJECT="$HOME/assembly-pi"

# Close stale standalone copies; the tmux stack owns one backend and one GUI process.
pkill -f 'assembly-pi-gui.py' 2>/dev/null || true
if tmux has-session -t assembly-pi 2>/dev/null; then
  tmux kill-session -t assembly-pi
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "tmux session '$SESSION' already running."
else
  tmux new-session -d -s "$SESSION" -n voice -c "$PROJECT" 'npm run dev'
  tmux split-window -h -t "$SESSION:voice" -c "$PROJECT" 'sleep 5; ./scripts/assembly-pi-gui.py; echo; echo GUI closed. Press Enter to relaunch.; read _; ./scripts/assembly-pi-gui.py'
  tmux select-layout -t "$SESSION:voice" even-horizontal >/dev/null
  tmux select-pane -t "$SESSION:voice.0"
  echo "started tmux session '$SESSION' with backend + GUI panes."
fi

echo "Attach with: tmux attach -t $SESSION"
echo "Detach with: Ctrl+b then d"
