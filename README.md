# assembly-pi

Terminal-first voice UI around Pi for Termux.

## Run

```bash
npm install
npm run dev
```

## Keys

- `R` / `Space`: record / capture speech
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
