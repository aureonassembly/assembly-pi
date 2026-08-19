#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SESSION="assembly-pi-stack"
PROJECT="$HOME/assembly-pi"
GUI_CMD='sleep 2; ./scripts/assembly-pi-gui.py; echo; echo GUI closed. Press Enter to relaunch.; read _; exec ./scripts/assembly-pi-gui.py'

# Do not let the older backend-only session fight over the same FIFO.
if tmux has-session -t assembly-pi 2>/dev/null; then
  tmux kill-session -t assembly-pi
fi

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION" -n voice -c "$PROJECT" 'npm run dev'
  tmux split-window -h -t "$SESSION:voice" -c "$PROJECT" "$GUI_CMD"
  tmux select-layout -t "$SESSION:voice" even-horizontal >/dev/null
  tmux select-pane -t "$SESSION:voice.0"
  echo "started tmux session '$SESSION' with backend + GUI panes."
else
  pane_count=$(tmux list-panes -t "$SESSION:voice" 2>/dev/null | wc -l | tr -d ' ')
  if [ "${pane_count:-0}" -lt 2 ]; then
    tmux split-window -h -t "$SESSION:voice" -c "$PROJECT" "$GUI_CMD"
    tmux select-layout -t "$SESSION:voice" even-horizontal >/dev/null
    echo "repaired tmux session '$SESSION' by adding GUI pane."
  else
    echo "tmux session '$SESSION' already running."
  fi
fi

echo "Attach with: tmux attach -t $SESSION"
echo "Detach with: Ctrl+b then d"
