# Discovery

## Device primitives

### Microphone recording

Command:

```bash
termux-microphone-record -f ~/tmp/voice-ui-mic-test2.m4a -l 3
sleep 5
ffprobe ~/tmp/voice-ui-mic-test2.m4a
```

Result:

- recording file was produced
- file was valid after waiting for finalization
- `ffprobe` reported AAC audio in an M4A container

### Speech recognition

Initial path tested:

```bash
termux-speech-to-text
```

Observed:

- live probe returned a transcript and partials
- observed latency was about 9 seconds
- later GUI use was unreliable: Android STT could end on silence or return no transcript

Decision:

- active voice STT is now Groq Whisper
- capture uses `termux-microphone-record` locally, then uploads the recorded M4A to Groq `/openai/v1/audio/transcriptions`
- required key: `GROQ_API_KEY`

### TTS

Command tested:

```bash
termux-tts-engines
termux-tts-speak "Pi voice test"
```

Observed:

- no shell error
- no visible stdout/stderr

Conclusion:

- TTS is treated as optional/manual only

## Pi transport selection

Pi `0.80.2` exposes:

- `pi --mode json`
- `pi --mode rpc`
- SDK exports from `@earendil-works/pi-coding-agent`

I selected the SDK transport.

Why:

- the package docs explicitly recommend `AgentSession` for Node.js/TypeScript
- it avoids scraping terminal output
- it gives direct session persistence and abort support
- it exposes streaming text events cleanly

Observed CLI behavior:

- `pi --mode json -p '...'` emits structured JSONL events
- `pi --mode rpc -p '...'` is supported
- `--session-id` and `--continue` are mutually exclusive

## Notes

- The app is terminal-first and does not build an Android APK.
- The Pi backend is a live SDK session; the UI now surfaces the session ID/file on startup.
- TTS starts OFF.
- The app keeps transcript confirmation before send.
- Speech capture is now local push-to-talk recording followed by Groq Whisper transcription, so breathing pauses do not cut off capture.
