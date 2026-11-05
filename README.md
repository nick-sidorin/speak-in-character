# InCharacter

**Speak naturally. Stay in character.**

An early Windows voice companion for roleplayers. This is the **audio and overlay prototype (v0.1.1)**: no AI translation, no OpenAI account, and no World of Warcraft addon required.

## What works

- A transparent always-on-top HUD that ignores clicks, so you can interact with the game underneath.
- Global hotkeys (also work while WoW is focused):
  - **Ctrl + Shift + Space** — start / stop microphone recording (toggle, **not** hold-to-talk yet).
  - **Ctrl + Shift + O** — open / close the control panel.
  - **Ctrl + Shift + M** — enable / disable HUD move mode; drag HUD with the mouse, then press again or click ✓ to lock it.
- Microphone capture using Electron's browser MediaRecorder.
- Local audio playback and **Save recording** (.webm or .ogg depending on codec support).
- No audio sent to the network. No text transcription or clipboard integration yet.
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
4. Press **Ctrl + Shift + Space** to start recording (first use may require microphone permission in Windows).
5. Speak. Press **Ctrl + Shift + Space** again to stop.
6. Open the panel to play back your recording or save it to a file.
7. Press **Ctrl + Shift + O** to return to the click-through HUD.
8. To reposition the small HUD, press **Ctrl + Shift + M**, drag it, and press the shortcut again or click ✓. The position survives a restart.
9. If the voice sounds metallic or filtered, compare recordings with the **noise/echo cancellation** option off (default) and on.

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
- **Electron preload** (`electron/preload.ts`): small typed IPC bridge, with context isolation.
- **React renderer** (`src/App.tsx`): microphone capture using `getUserMedia` + `MediaRecorder`, recording controls, playback, status and overlay UI.
- **GitHub Actions** (`.github/workflows/windows.yml`): Windows x64 application build.

This does not inject into or automate the game. You remain in control of gameplay and chat messages.

## Planned next iterations

1. Windows playtest and polish overlay focus / microphone permissions.
2. Hold-to-talk keydown/keyup and configurable shortcut.
3. OpenAI transcription (Russian, English and mixed speech), with explicit opt-in and API key storage.
4. Optional RP-specific translation, character profile and game terminology.
5. Clipboard output and, separately, opt-in context from WoW chat logs.

## Privacy

In v0.1.1, recordings stay in the app's memory until you replace them or close it. Saving is explicit. The application itself sends no microphone audio to external APIs. There is no telemetry.

Licensed under MIT (see `LICENSE`).
