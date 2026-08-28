#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SHORTCUT_DIR="$HOME/.shortcuts"
PROJECT="$HOME/assembly-pi"
mkdir -p "$SHORTCUT_DIR"
chmod +x "$PROJECT/scripts/start-stack-tmux.sh" "$PROJECT/scripts/start-stack-session-picker.sh" "$PROJECT/scripts/attach-stack-tmux.sh"

cat > "$SHORTCUT_DIR/assembly-pi-stack" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
cd "$PROJECT"
./scripts/start-stack-tmux.sh
exec ./scripts/attach-stack-tmux.sh
EOF
chmod +x "$SHORTCUT_DIR/assembly-pi-stack"

cat > "$SHORTCUT_DIR/assembly-pi-picker" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
cd "$PROJECT"
./scripts/start-stack-session-picker.sh
exec ./scripts/attach-stack-tmux.sh
EOF
chmod +x "$SHORTCUT_DIR/assembly-pi-picker"

echo "Installed Termux shortcuts:"
echo "  $SHORTCUT_DIR/assembly-pi-stack"
echo "  $SHORTCUT_DIR/assembly-pi-picker"
echo "assembly-pi-stack starts/attaches the latest-session stack."
echo "assembly-pi-picker asks which Pi session to continue, then opens the UI."
