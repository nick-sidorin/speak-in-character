# InCharacter

**Speak naturally. Stay in character.**

InCharacter is a Windows voice companion for roleplayers. Hold a shortcut while you speak naturally in Russian, English or a mixture. OpenAI transcribes the audio, turns the intended message into a natural sentence in your selected **reply language**, and copies it to the clipboard. You review and paste it into the game chat yourself.

## Windows build

1. Open [GitHub Actions](https://github.com/nick-sidorin/speak-in-character/actions) and choose the latest **successful** Windows build.
2. Download the **InCharacter-Windows** artifact ZIP, extract the complete folder and launch `InCharacter.exe`.
3. Use borderless/fullscreen-windowed mode for predictable overlays. The app requires no locally installed Visual Studio or Node.js.

**v0.7.1** is a development build, not a signed release. Microphone, Windows display behavior and hotkeys still need real-machine testing. SmartScreen may display an unknown-publisher warning.

## What it does

- **Push-to-talk:** hold the recording shortcut, speak, release to stop.
- **One-at-a-time processing:** recording stays locked until OpenAI has processed the current message.
- **OpenAI voice processing:** `gpt-4o-transcribe` + `gpt-4.1-mini`. A valid separate OpenAI API key and API billing are required for processing.
- **Reply language:** type any target language into a plain text field; English by default. **Input speech can be in another language or mixed languages.**
- **Interface language:** Russian, English, French, Spanish or German. Independent of the reply language.
- **Additional context:** one optional multiline field for any situational prompt, character description, game terms or contextual notes. Existing character and situation values are migrated into it automatically on first launch of v0.7.0. The neutral core prompt stays independent of any game.

**Speech presets:** select a preset on the **Reply** screen. Preset management (open folder / reload) is in Settings. An optional JSON preset provides a stylistic voice for the final output. Presets never rewrite the original transcript and must not change the content of what was said. Bundled examples include Dwarven voice, Pirate voice and Courtly speech. No preset is the default.

**Style precedence:** the core translator preserves the spoken meaning. An optional preset sets the baseline voice, and the **Additional context** field takes precedence over the preset when it adds a specific character trait. Compatible instructions blend together: a pirate who stutters frequently should sound like a pirate **and** visibly stutter in the finished line. No trait should be silently dropped just because a preset is active. The original transcription is not stylized.
- **Draft editor:** review original transcription and final RP sentence, correct them and manually copy.
- **History:** the last 15 recordings (audio, text, estimated cost) in this session. History is cleared when the application quits.
- **Settings:** protected API key, audio processing, **speech presets**, move HUD and shortcut editor.
- **Compact click-through HUD:** tiny ~254×54 px two-line status with recording/processing/success indicator. On Windows, native window shaping clips opaque corner pixels, and a reduced window opacity makes the HUD translucent without disturbing the main editor's full opacity.
- **Position persistence:** separate HUD and panel positions on disk.

## Customizable shortcuts

Initial settings:

| Action | Default |
| --- | --- |
| Hold to speak | Caps Lock |
| Open/close panel | Ctrl + Shift + O |
| Move HUD | Ctrl + Shift + M |

Customize all three from **Settings**: click **Assign**, then press any supported keyboard key or combination. The binding is saved instantly, without a Save button. Press **Escape** while assigning to cancel. Standalone keys such as Caps Lock, Space, letters and F1–F12 are supported; modifiers Ctrl/Alt/Shift can be combined with them. Standalone Ctrl/Alt/Shift and OS-reserved shortcuts are not supported. Primary keys must differ across actions to avoid simultaneous triggers. Existing installations that still use all three original default shortcuts automatically migrate the record key to Caps Lock; user-customized bindings are preserved.

**Caps Lock caveat:** Windows still toggles the Caps Lock typing state when the key is pressed. InCharacter does not intercept, block or synthesize game input. If this is inconvenient while chatting or playing, rebind recording to another key from Settings.

Hold-to-talk uses a tiny Windows helper at `native/hotkey.cs`; it polls only the three configured combinations via `GetAsyncKeyState` and reports key down/up or one-shot window actions. It does not log other keys, read game memory or interact with gameplay. If the helper is unavailable, shortcuts fall back to Electron's global shortcuts when supported and recording becomes a toggle.

## Custom speech presets

Built-in presets are **individual JSON files** in the `presets/` directory, packaged with the application. The core rewrite prompt in `electron/ai.ts` is deliberately neutral: it has no hard-coded WoW, dwarf or pirate assumptions.

To add your own preset without rebuilding the app:

1. Open **Settings → Speech presets → Open folder**.
2. Place a UTF-8 `.json` file inside the opened personal presets directory.
3. Click **Reload presets** and select it from the list.

You can also override a bundled preset by using the same `id` in a personal file. Presets remain local except that the **selected preset instructions and optional recognition hints are sent to OpenAI when making a request**.

Each JSON file contains `schemaVersion`, `id`, `name`, `description`, `instructions` and optional `recognitionHints`. See [presets/README.md](presets/README.md) for a complete editable example. The user-editable folder is inside the Electron application data directory (`%APPDATA%\\InCharacter\\presets` on a typical Windows installation).

## Position and focus

The Windows app uses a **non-transparent, frameless** window with native rounded-region clipping via Electron `setShape` and adjusted opacity per mode. The HUD is deliberately translucent; the main panel stays opaque. This avoids relying on the problematic fully transparent Windows 11 window mode. The HUD ignores mouse clicks until move mode is enabled. The positioning fix is experimental and needs user testing on Windows 11.

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
