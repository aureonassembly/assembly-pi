# assembly-pi

Terminal-first voice UI around Pi for Termux.

## Groq voice transcription setup

Voice transcription now uses Groq Whisper instead of Android `termux-speech-to-text`.

Create a local env file:

```bash
mkdir -p ~/.config/assembly-pi
printf 'GROQ_API_KEY=your_groq_key_here\n' > ~/.config/assembly-pi/env
chmod 600 ~/.config/assembly-pi/env
```

Optional model override:

```bash
printf 'GROQ_STT_MODEL=whisper-large-v3-turbo\n' >> ~/.config/assembly-pi/env
```

## Run

Foreground backend:

```bash
npm install
npm run dev
```

Or persistent tmux backend:

```bash
cd ~/assembly-pi
./scripts/start-backend-tmux.sh
```

Attach to see answers:

```bash
tmux attach -t assembly-pi
```

Detach without killing it: `Ctrl+b`, then `d`.

## Clickable Android GUI

This uses the same `termuxgui` approach as `~/gui-game.py`.

Start the terminal backend first, preferably in tmux:

```bash
cd ~/assembly-pi
./scripts/start-backend-tmux.sh
```

Then launch the clickable GUI:

```bash
cd ~/assembly-pi
./scripts/assembly-pi-gui.py
```

The GUI has real Android buttons for two main paths:

### Type → Pi

1. type in the prompt box
2. press `SEND TYPED PROMPT TO PI`
3. answer appears in the terminal/tmux backend

### Voice → Pi

Fast path:

1. press `🎙 VOICE ASK PI`
2. speak at your own pace; pauses are fine because audio is recorded locally
3. press it again
4. recorded audio is sent to Groq Whisper for transcription
5. transcript is sent automatically to Pi
6. answer appears in terminal/tmux backend

Review path:

1. press `REC REVIEW`
2. speak
3. press `REC REVIEW` again
4. review/edit transcript in terminal
5. press `SEND REVIEWED`

Other buttons: speak answer, clear, quit.

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
- Voice STT uses local Termux microphone recording plus Groq Whisper transcription.
