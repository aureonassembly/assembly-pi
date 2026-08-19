#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SHORTCUT_DIR="$HOME/.shortcuts"
PROJECT="$HOME/assembly-pi"
mkdir -p "$SHORTCUT_DIR"
chmod +x "$PROJECT/scripts/start-stack-tmux.sh" "$PROJECT/scripts/attach-stack-tmux.sh"

cat > "$SHORTCUT_DIR/assembly-pi-stack" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
cd "$PROJECT"
./scripts/start-stack-tmux.sh
exec ./scripts/attach-stack-tmux.sh
EOF
chmod +x "$SHORTCUT_DIR/assembly-pi-stack"

echo "Installed Termux shortcut: $SHORTCUT_DIR/assembly-pi-stack"
echo "It starts/attaches tmux session assembly-pi-stack with backend + GUI split panes."
