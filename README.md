# InCharacter

**Speak naturally. Stay in character.**

An early Windows voice companion for roleplayers. This is the **voice-to-RP prototype (v0.2.0)**: on Windows, record speech, transcribe Russian/English/mixed audio via OpenAI, convert it into an English RP line, and automatically copy it to the clipboard. No WoW addon required.

## What works

- A transparent always-on-top HUD that ignores clicks, so you can interact with the game underneath.
- Global hotkeys (also work while WoW is focused):
  - **Ctrl + Shift + Space** — start / stop microphone recording (toggle, **not** hold-to-talk yet).
  - **Ctrl + Shift + O** — open / close the control panel.
  - **Ctrl + Shift + M** — enable / disable HUD move mode; drag HUD with the mouse, then press again or click ✓ to lock it.
- Microphone capture using Electron's browser MediaRecorder.
- Local audio playback and **Save recording** (.webm or .ogg depending on codec support).
- Optional OpenAI-powered voice transcription and faithful natural-English RP phrasing using a user-supplied API key.
- Original transcript and resulting RP line are editable, with a manual **Re-translate** action.
- When processing succeeds, the RP line is copied to the clipboard automatically. Paste it into WoW chat yourself (`Ctrl+V`, Enter).
- Character description and situation / place names provide optional context and are saved locally.
- Without a configured API key, audio recording and playback remain entirely local.
- Panel can be dragged via its header. The HUD can be dragged in move mode; both window positions persist across app launches.
- Optional microphone processing toggle (echo cancellation, noise suppression and automatic gain); **off** by default for a more natural voice, and remembered across app launches.

## Download the Windows executable

Open [Actions](https://github.com/nick-sidorin/speak-in-character/actions), select the latest successful **Windows build**, then download the **InCharacter-Windows** artifact ZIP. Extract the ZIP to a folder, then run `InCharacter.exe` inside. Keep the extracted files together.

The executable is **unsigned**. Windows SmartScreen may warn about an unknown publisher. The code is public so you can inspect it before running.

A fresh Windows machine does **not** need Visual Studio, Node.js or Python to run the packaged executable.

## Try it with WoW

1. For reliable overlays, use **Windowed (Fullscreen)** / borderless mode rather than exclusive fullscreen.
2. Launch InCharacter. A small HUD appears near the upper-right of your screen.
3. Press **Ctrl + Shift + O** for the panel.
4. Open the control panel and optionally enter your own OpenAI API key to enable speech-to-English processing. Get a key at https://platform.openai.com/api-keys (requires separate OpenAI API billing, not included with ChatGPT).
5. Optionally enter a character profile and nearby game terms; these are used for transcription and rewriting hints.
6. Press **Ctrl + Shift + Space** to start recording (first use may require microphone permission in Windows).
7. Speak naturally in Russian, English or both. Press **Ctrl + Shift + Space** to stop. If a key is set, processing starts automatically.
8. Open the panel to edit the raw transcript or the English line. The translated line has already been copied to clipboard when ready.
9. Press **Ctrl + Shift + O** to return to the click-through HUD.
10. To reposition the small HUD, press **Ctrl + Shift + M**, drag it, and press the shortcut again or click ✓. The position survives a restart.
11. If the voice sounds metallic or filtered, compare recordings with the **noise/echo cancellation** option off (default) and on.

If the key combination is already used by another program (or by WoW), close that program/change its shortcut. In this prototype shortcut remapping is not implemented yet; the control-panel button remains available.

**Important:** The app was built and packaged in CI, but overlay focus behavior, global shortcuts and microphone capture still require a real Windows playtest. Borderless mode generally offers the most predictable overlay behavior.

## Local development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run typecheck
npm run build
npm run dist:win
```

The last command builds an unpacked Windows application folder (`release/win-unpacked/`). For packaging, use Windows or the GitHub Actions workflow.

## Architecture

- **Electron main** (`electron/main.ts`): transparent always-on-top window, global shortcuts, permission handling, save dialog and filesystem.
- **OpenAI pipeline** (`electron/ai.ts`): Windows DPAPI-encrypted API-key storage, network calls, canonical-name-aware rewriting, clipboard.
- **Electron preload** (`electron/preload.ts`): small typed IPC bridge, with context isolation.
- **React renderer** (`src/App.tsx`): microphone capture using `getUserMedia` + `MediaRecorder`, recording controls, playback, status and overlay UI.
- **GitHub Actions** (`.github/workflows/windows.yml`): Windows x64 application build.

This does not inject into or automate the game. You remain in control of gameplay and chat messages.

## Planned next iterations

1. Windows playtest and polish overlay focus / microphone permissions.
2. Hold-to-talk keydown/keyup and configurable shortcut.
3. More robust handling for uncertain WoW proper names and regional game localization.
4. Conversation context selection and per-character profiles.
5. Opt-in context from WoW chat logs.

## Privacy

Recordings stay in memory until replaced or the app closes, unless you explicitly save them. **Without an API key** nothing is uploaded. **After you configure a key**, finishing a recording sends that audio to OpenAI for transcription, then sends the transcript, character and situation to OpenAI for rewriting. API requests are billable; API billing is separate from a ChatGPT subscription. No automatic WoW message sending, no analytics or telemetry. The OpenAI key is encrypted at rest using Windows DPAPI via Electron safeStorage. Never commit API keys into source control.

Licensed under MIT (see `LICENSE`).
