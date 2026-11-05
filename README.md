# InCharacter

**Speak naturally. Stay in character.**

InCharacter is a Windows voice companion for roleplay and everyday chat. Speak in any language (including Russian/English mixtures); OpenAI transcribes your voice and rewrites the **same message** in your chosen language and character style. Review the result, then paste it manually wherever you want.

> **Current development version: 0.8.2** · Windows x64 · unsigned prototype

## Download and run

**[Download the latest Windows Preview from GitHub Releases](https://github.com/nick-sidorin/speak-in-character/releases)** — no GitHub Actions navigation required.

1. Download the `InCharacter-v0.8.2-Windows-x64-portable.zip` asset from the release page.
2. **Extract the whole ZIP** to a folder and launch `InCharacter.exe`. Visual Studio and Node.js are **not** needed.
3. For game overlays, use **borderless/windowed fullscreen** rather than exclusive fullscreen.
4. Open the panel with **Ctrl + Shift + O** and configure your personal OpenAI API key in **Settings**. API billing is separate from ChatGPT.
5. Hold **Caps Lock**, speak, then release. The translated line goes to the clipboard; review and paste it with **Ctrl + V** into chat, then send manually.

Development builds are also available on [GitHub Actions](https://github.com/nick-sidorin/speak-in-character/actions/workflows/windows.yml), but public downloads should use **Releases**.

Unsigned builds may trigger a Windows SmartScreen warning. This project is still undergoing testing on real Windows/game setups.

## How it works

- **Push-to-talk:** hold the configured hotkey to record, release to finish.
- **Recording guard:** accidental presses under **250 ms** are discarded. No audio Blob, recording history entry or OpenAI request is created for these taps. A quick word such as *«давай»* can still be processed.
- **Conservative silence detection:** on recordings of **1.2 seconds or more**, InCharacter measures the microphone signal **locally**. If there is consistently almost no audio signal, it discards the recording before upload. This is **not a speech recognizer or voice-activity model**: background noise may pass through; exceptionally quiet speech could be discarded. Recordings between 250 ms and 1.2 seconds are **not** rejected by the silence check.
- **Draft protection:** discarded recordings do not replace the previous transcript/reply or appear in History. No API charges are incurred for skipped recordings.
- **One request at a time:** while OpenAI is processing, a new recording cannot begin.
- **Transcription:** `gpt-4o-transcribe` recognizes speech in its original language(s).
- **Rewrite:** `gpt-4.1-mini` generates one natural message in the selected **reply language**. The field is plain text, default **English**; input speech may use other languages.
- **Additional context:** one optional multi-line prompt for the character, speaker quirks, game terms, scene and other disambiguating background. Existing separate character/situation fields are migrated when upgrading.
- **Presets:** optional JSON speech-style presets (Dwarven, Pirate, Courtly). Select the active preset on the **Reply** screen.
- **Style precedence:** preserve the original meaning first; use the chosen preset as a baseline; **Additional context overrides conflicting preset style instructions**, while compatible traits combine. For example, a pirate who stutters can sound both pirate-like and stuttered, but the original transcript is not stylized.
- **Session history:** up to 15 recent recordings, their audio and drafts, a save-audio action and estimated session costs. Cleared on app exit.
- **UI languages:** Russian, English, French, Spanish, German, set independently from the reply language.
- **HUD:** a tiny, translucent (~254 × 54 px) click-through status panel with a recording indicator, spinner and completion check. Its position and the main panel's position persist between launches.

## Hotkeys and Windows behavior

| Action | Default |
| --- | --- |
| Hold to record | **Caps Lock** |
| Show/hide panel | **Ctrl + Shift + O** |
| Move HUD | **Ctrl + Shift + M** |

Change them in **Settings → Keyboard shortcuts**: select **Assign**, press a single key or combination, and it's saved immediately. **Esc** cancels assignment. Single keys like Caps Lock and F1–F12 can be used, as can modifier combinations (Ctrl, Shift, Alt plus a primary key). The same primary key cannot be assigned to two different actions.

The Windows helper in `native/hotkey.cs` uses a limited `WH_KEYBOARD_LL` hook to **suppress only assigned shortcuts**: Caps Lock should not toggle typing case; Ctrl + Shift + O should not also activate the browser's shortcut. This behavior needs testing with your particular game and keyboard setup. Other software using the same shortcut (for example Whisper Flow on Caps Lock), elevated applications, secure desktop or games using raw input can conflict. Do not rely on one app always taking precedence.

The helper reports only shortcut actions to Electron; it does not log keystrokes, synthesize game input or read game memory. Interception pauses while assigning a new binding.

## Manage speech presets

The neutral core prompt has **no hardcoded World of Warcraft or dwarf assumptions**. Each style is a JSON file bundled in [`presets/`](presets). To add your own without rebuilding:

1. Open **Settings → Speech presets → Open folder**.
2. Add a UTF-8 `.json` file to the personal presets folder.
3. Press **Reload presets** and select the preset on **Reply**.

A personal preset with the same `id` overrides the bundled one. See [the schema and example](presets/README.md). Presets are kept locally until selected; when processing, the chosen preset's instructions and recognition hints are sent to OpenAI.

## Privacy and costs

- **Without an API key:** microphone recording and playback remain local.
- **With an API key:** completed, accepted recordings go to OpenAI for transcription; the transcript, additional context and selected style instructions go to OpenAI for rewriting.
- **Clipboard:** the result is copied locally; InCharacter **does not** send messages into games or chats automatically.
- **API billing:** independent from ChatGPT. The app shows an estimate using the approximate `gpt-4o-transcribe` rate of **$0.006 per minute** plus text token usage for `gpt-4.1-mini`. Check actual charges in [OpenAI Usage](https://platform.openai.com/usage).
- **Key storage:** Electron `safeStorage`/Windows DPAPI. No API key in the repository. No built-in telemetry or analytics.

## Windows implementation

- Electron + React + TypeScript.
- `electron/main.ts` — windows, positioning, keyboard-helper lifecycle and IPC.
- `electron/ai.ts` — transcription, rewrite prompt and API key handling.
- `electron/presets.ts` — file-based speech presets.
- `native/hotkey.cs` — Windows keyboard shortcut interception, including a routing self-test.
- `src/App.tsx` and `src/styles.css` — recorder, conservative signal-level silence check, history and UI.
- `.github/workflows/windows.yml` — Windows CI build with native helper tests.

To develop from source, install Node.js 22+ and run:

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

To package on Windows: compile `native/hotkey.cs` into `native/hotkey.exe` using the .NET Framework C# compiler, then run `npm run dist:win`. The GitHub Actions Windows workflow performs those steps for you.

**CI policy:** regular commits to `main` do **not** trigger a build. Windows test builds are created only when specifically requested. During development, a temporary `build/vX.Y.Z` branch may carry a one-off push trigger; `main` remains manual-only.

Licensed under MIT.
