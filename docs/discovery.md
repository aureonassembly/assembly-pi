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

### Android speech recognition

Command tested:

```bash
termux-speech-to-text
```

Observed in the harness:

- exits 0 immediately with no transcript output
- no useful partial output observed here

Conclusion:

- built-in Android STT could not be confirmed from the non-interactive harness
- the MVP still uses it as the primary STT provider, but empty-output handling is in place

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
- TTS starts OFF.
- The app keeps transcript confirmation before send.
