#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SHORTCUT_DIR="$HOME/.shortcuts"
APP="$HOME/assembly-pi/scripts/assembly-pi-gui.py"
mkdir -p "$SHORTCUT_DIR"
chmod +x "$APP"

cat > "$SHORTCUT_DIR/assembly-pi-gui" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
exec "$APP"
EOF
chmod +x "$SHORTCUT_DIR/assembly-pi-gui"

echo "Installed GUI launcher: $SHORTCUT_DIR/assembly-pi-gui"
echo "Run terminal backend first: cd ~/assembly-pi && npm run dev"
