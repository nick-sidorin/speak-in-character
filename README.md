# InCharacter

**Speak naturally. Stay in character.**

InCharacter is a Windows voice companion for roleplayers. Hold a shortcut while you speak naturally in Russian, English or a mixture. OpenAI transcribes the audio, turns the intended message into a natural sentence in your selected **reply language**, and copies it to the clipboard. You review and paste it into the game chat yourself.

## Windows build

1. Open [GitHub Actions](https://github.com/nick-sidorin/speak-in-character/actions) and choose the latest **successful** Windows build.
2. Download the **InCharacter-Windows** artifact ZIP, extract the complete folder and launch `InCharacter.exe`.
3. Use borderless/fullscreen-windowed mode for predictable overlays. The app requires no locally installed Visual Studio or Node.js.

**v0.4.0** is a development build, not a signed release. Microphone, Windows display behavior and hotkeys still need real-machine testing. SmartScreen may display an unknown-publisher warning.

## What it does

- **Push-to-talk:** hold the recording shortcut, speak, release to stop.
- **One-at-a-time processing:** recording stays locked until OpenAI has processed the current message.
- **OpenAI voice processing:** `gpt-4o-transcribe` + `gpt-4.1-mini`. A valid separate OpenAI API key and API billing are required for processing.
- **Reply language:** pick one of 27 common languages, or type another; English by default. **Input speech can be in another language or mixed languages.**
- **Interface language:** Russian, English, French, Spanish or German. Independent of the reply language.
- **Game context:** character / style and situation fields accept natural language, including localized names and Russian prompts. They are hints for interpreting the user's words, not content for the model to invent.
- **Draft editor:** review original transcription and final RP sentence, correct them and manually copy.
- **History:** the last 15 recordings (audio, text, estimated cost) in this session. History is cleared when the application quits.
- **Settings:** protected API key, audio processing, move HUD and shortcut editor.
- **Compact click-through HUD:** ready, recording, processing and success indicators with customizable keycap hints.
- **Position persistence:** separate HUD and panel positions on disk.

## Customizable shortcuts

Initial settings:

| Action | Default |
| --- | --- |
| Hold to speak | Ctrl + Shift + Space |
| Open/close panel | Ctrl + Shift + O |
| Move HUD | Ctrl + Shift + M |

Customize all three from the **Settings** tab using modifier and key dropdowns; save to apply immediately. Choices include Ctrl, Alt, Shift and combinations, plus letters, numbers, Space and F1–F12. All shortcuts must be distinct. A shortcut occupied by another app will be rejected and the previous configuration restored.

Hold-to-talk uses a tiny Windows helper at `native/hotkey.cs`; it polls only the configured combination via `GetAsyncKeyState` and reports key down/up. It does not log keys, read game memory or interact with gameplay. If the helper is unavailable, recording falls back to toggle mode.

## Position and focus

The Windows app uses a **non-transparent, frameless** window with native rounded corners (where supported) to work around Electron / DWM focus-loss artifacts. The HUD ignores mouse clicks until move mode is enabled. The positioning fix is experimental and needs user testing on Windows 11.

Both positions are stored in Electron's application data folder as `window-positions.json`. Shortcut settings use `shortcuts.json`. API keys are stored encrypted using Electron `safeStorage` on Windows (DPAPI).

## Costs / privacy

Without an API key, audio recording and playback stay local. With a configured key, completed recordings are uploaded to OpenAI for transcription, then the transcript and configured context are sent for rewriting. The current session cost estimate assumes ~$0.006 per transcription minute plus billed text tokens; actual charges are shown in [OpenAI Usage](https://platform.openai.com/usage).

No telemetry. No automatic game input or sending chats on your behalf. The generated line is copied to your clipboard for manual review and pasting.

## Development

Requires Node.js 22+. Source commands:

```sh
npm install
npm run typecheck
npm run build
npm run dev
```

On Windows you can package with `npm run dist:win`; a locally built Windows helper is required in `native/hotkey.exe`. GitHub Actions compiles the helper and packages a Windows x64 application automatically when the workflow is manually triggered or a `build/*` branch is created.

**CI builds do not run on every commit to `main`.** We intentionally avoid noisy failing-build notifications while iterating.

Licensed under MIT.
