#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SESSION="assembly-pi"
PROJECT="$HOME/assembly-pi"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "tmux session '$SESSION' already running."
else
  tmux new-session -d -s "$SESSION" -c "$PROJECT" 'npm run dev'
  echo "started tmux session '$SESSION'."
fi

echo "Attach with: tmux attach -t $SESSION"
echo "Detach with: Ctrl+b then d"
