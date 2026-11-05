# InCharacter

**Speak naturally. Stay in character.**

InCharacter is a Windows voice companion for roleplayers. Hold a key chord while you speak in Russian, English or both. It transcribes your speech, turns your intended message into natural English, and copies the draft to your clipboard for manual pasting into game chat.

This is **v0.3.0 — first UX / push-to-talk prototype**. The Windows binary is built by GitHub Actions. It has not yet been playtested against the user's actual WoW installation.

## Windows download and launch

1. Open [GitHub Actions](https://github.com/nick-sidorin/speak-in-character/actions).
2. Select the newest **successful Windows build** workflow.
3. Download the **InCharacter-Windows** artifact ZIP, extract its contents into one folder, then run `InCharacter.exe`.
4. Start WoW in **Windowed (Fullscreen)** / borderless mode for reliable overlay display.
5. Open the panel with **Ctrl + Shift + O**. Go to **Настройки** and add an OpenAI API key (OpenAI Platform billing is separate from ChatGPT).
6. Optionally provide your character and situation (names or places) on the **Реплика** tab.
7. Hold **Ctrl + Shift + Space**, speak, then release it. The translated English text is automatically copied to the clipboard once ready.
8. Press **Enter** in the game chat, paste with **Ctrl + V**, review and send manually.

You do **not** need to install Visual Studio, .NET SDK or Node.js to run the GitHub-built Windows archive.

## Controls

| Shortcut | Behavior |
| --- | --- |
| Ctrl + Shift + Space | **Hold** to record; release to stop and process |
| Ctrl + Shift + O | Show / hide control panel |
| Ctrl + Shift + M | Enable HUD move mode; drag with mouse, then press again or click ✓ |

In production builds on Windows, a tiny helper checks **only Ctrl, Shift, and Space** with the Windows `GetAsyncKeyState` API. It does not use a keyboard hook, log keys, automate the game, read process memory, or generate game input. If the helper is unavailable, the app falls back to **toggle recording** (press once to start; again to stop) and displays that mode in Settings.

Starting another recording is disabled until the current OpenAI processing finishes. Key auto-repeat does not restart a recording.

## Interface

- **Реплика** — optional character and situation prompts, microphone status, original transcript, English line, retranslate and copy.
- **История** — the 15 most recent recordings of this session, one row of playback controls with a small download icon, and a way to reopen any previous draft.
- **Настройки** — API key, microphone signal processing toggle, move mode and an **estimated session cost** with a link to OpenAI Usage.

The small HUD shows a red dot for recording, a large spinner for requests and a green check once the text is ready. The HUD is click-through by default, so it won't block interactions in WoW. The panel is interactive.

The mini-HUD and main panel are both movable. Their locations are saved to `window-positions.json` inside Electron's Windows user-data folder. They are restored at startup (clamped to visible monitors).

## Audio quality

By default, browser microphone noise suppression, echo cancellation and automatic gain control are disabled. Enable them in **Настройки** if necessary. The operating system or microphone driver may still apply its own processing.

## Costs and security

The current speech model is `gpt-4o-transcribe`, listed at **about $0.006 per minute**. Rewriting uses `gpt-4.1-mini`, with text token costs. The app estimates the audio cost by duration and estimates the rewriting cost using the text token counts from OpenAI's response. These are **estimates** and do not replace the actual costs at https://platform.openai.com/usage.

Without an API key, microphone recording and session playback work locally. Once an API key is saved, finishing a recording sends it to OpenAI and automatically runs an English rewrite. The key is stored encrypted with Windows DPAPI via Electron's `safeStorage`, not included in source control. No analytics or telemetry; no game automation. The app never sends your message into WoW; you paste and send it manually.

## Development

Requires Node.js 22+ for source builds:

```bash
npm install
npm run dev
npm run typecheck
npm run dist:win
```

The `dist:win` script packages the compiled Windows application to `release/win-unpacked`. For the native push-to-talk helper, compile `native/hotkey.cs` with the .NET Framework C# compiler (the GitHub Actions workflow already handles it). The compiled `hotkey.exe` goes into app resources via `extraResources` in `package.json`.

App design:

- `electron/main.ts`: windows, safe IPC, shortcuts, file saving and native helper lifecycle.
- `electron/ai.ts`: OpenAI transcription and rewriting, encrypted key, clipboard.
- `native/hotkey.cs`: emits DOWN and UP for Ctrl + Shift + Space.
- `src/App.tsx`, `src/styles.css`: React UI, session recordings and status indicators.
- `.github/workflows/windows.yml`: portable unpacked Windows build.

Licensed under MIT.
