# assembly-pi

Terminal-first voice UI around Pi for Termux.

## Run

```bash
npm install
npm run dev
```

## Clickable Android GUI

This uses the same `termuxgui` approach as `~/gui-game.py`.

Start the terminal backend first:

```bash
cd ~/assembly-pi
npm run dev
```

Then launch the clickable GUI:

```bash
cd ~/assembly-pi
./scripts/assembly-pi-gui.py
```

The GUI has real Android buttons for:

- record/stop
- send confirmed transcript
- send a typed prompt directly to the live Pi session
- speak answer
- clear
- quit

Optional GUI launcher shortcut:

```bash
cd ~/assembly-pi
./scripts/install-gui-shortcut.sh
```

## Android widget buttons

Install/update Termux:Widget shortcut buttons:

```bash
cd ~/assembly-pi
./scripts/install-widget-shortcuts.sh
```

Then add Termux:Widget shortcuts from the Android home screen.

Available buttons:

- `assembly-pi-record-toggle`: start/stop speech capture
- `assembly-pi-send`: send confirmed transcript to Pi
- `assembly-pi-clear`: clear/cancel
- `assembly-pi-speak`: speak answer
- `assembly-pi-quit`: quit app

The terminal app must be running (`npm run dev`) for the buttons to control it.

## Keys

- `R` / `Space`: start/stop speech capture (pauses auto-restart)
- `Enter`: send confirmed transcript
- `E`: edit transcript
- `S`: speak answer (TTS)
- `T`: toggle TTS OFF / MANUAL
- `X`: clear
- `Esc`: abort/cancel
- `↑` / `↓`: scroll
- `Ctrl+C`: quit

## What it does

1. captures speech with Termux/Android STT
2. shows the transcript before sending
3. lets you edit/confirm it
4. sends it to Pi through the SDK transport
5. streams Pi’s response back into the terminal
6. optionally speaks the answer with Android TTS

## Notes

- Pi transport uses `@earendil-works/pi-coding-agent` SDK.
- Recording primitives were verified separately with `termux-microphone-record`.
- Android STT is best-effort; if it returns nothing, the UI reports it cleanly.
