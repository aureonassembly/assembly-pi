#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SHORTCUT_DIR="$HOME/.shortcuts"
FIFO="$HOME/.local/state/assembly-pi/control.fifo"
mkdir -p "$SHORTCUT_DIR" "$(dirname "$FIFO")"

write_button() {
  local name="$1"
  local command="$2"
  local path="$SHORTCUT_DIR/$name"
  cat > "$path" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
FIFO="$FIFO"
if [ ! -p "\$FIFO" ]; then
  termux-toast "assembly-pi is not running" 2>/dev/null || echo "assembly-pi is not running"
  exit 1
fi
printf '%s\n' '$command' > "\$FIFO"
EOF
  chmod +x "$path"
}

write_button "assembly-pi-record-toggle" "TOGGLE"
write_button "assembly-pi-send" "SEND"
write_button "assembly-pi-clear" "CLEAR"
write_button "assembly-pi-speak" "SPEAK"
write_button "assembly-pi-quit" "QUIT"

cat <<EOF
Installed Termux:Widget shortcuts in:
  $SHORTCUT_DIR

Buttons:
  assembly-pi-record-toggle  start/stop recording
  assembly-pi-send           send confirmed transcript to Pi
  assembly-pi-clear          clear/cancel
  assembly-pi-speak          speak answer
  assembly-pi-quit           quit app

Add them from the Android home screen via Termux:Widget.
Keep the terminal app running with: cd ~/assembly-pi && npm run dev
EOF
