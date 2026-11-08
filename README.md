# SpeakInCharacter

**Speak naturally. Stay in character.**

SpeakInCharacter is a Windows voice companion for roleplay and everyday chat. Speak in any language (including Russian/English mixtures); OpenAI transcribes your voice and rewrites the **same message** in your chosen language and character style. Review the result, then paste it manually wherever you want.

**Version 1.0.0** · Windows x64 · portable application

## Download and run

**[Download SpeakInCharacter 1.0.0 for Windows](https://github.com/nick-sidorin/speak-in-character/releases/download/v1.0.0/SpeakInCharacter-v1.0.0-Windows-x64-portable.zip)** · [Release notes and SHA-256 checksum](https://github.com/nick-sidorin/speak-in-character/releases/tag/v1.0.0)

1. Extract the **whole ZIP** into a new folder and launch `SpeakInCharacter.exe`. Visual Studio and Node.js are **not** needed.
2. Configure your personal OpenAI API key in **Settings**. API usage is billed separately from ChatGPT.
3. Hold **Caps Lock**, speak, then release. Review the rewritten/translated line and manually paste it with **Ctrl + V** into your chat.
4. The editor appears in the taskbar and Alt-Tab; the small HUD stays above other windows. Use **borderless/windowed fullscreen** for games.
5. Closing the editor hides it to the tray. Click the tray icon or press **Ctrl + Shift + O** to reopen it. Tray **Quit** or the editor's **Exit** button fully closes the app.

**Updating:** fully quit the old instance through the tray before launching a new version. Extract releases into separate versioned folders; this also avoids stale Explorer icon caching. Settings, encrypted API keys, presets, shortcuts, positions and history remain in the original `%APPDATA%\InCharacter` directory.

The portable build is unsigned. Windows SmartScreen or Chrome may display download/run warnings; a browser verdict alone does not establish its cause.

## Demo

### Main window
<img width="30%" alt="Screenshot 2026-11-08 163012" src="https://github.com/user-attachments/assets/a4a52292-ff3d-4ed3-892f-e9b38727c3d7" />
<img width="30%" alt="Screenshot 2026-11-08 163042" src="https://github.com/user-attachments/assets/cf4b4514-35d9-4608-9c4d-b602f61eb8ff" />
<img width="30%" alt="Screenshot 2026-11-08 163059" src="https://github.com/user-attachments/assets/99fa8ef7-9687-4da2-b107-9a642dfdc3d2" />

### Overlay states
<img width="262" height="201" alt="Screenshot 2026-11-08 163426" src="https://github.com/user-attachments/assets/9306814f-05bb-415b-a326-58ed21419447" />
<img width="218" height="135" alt="Screenshot 2026-11-08 163504" src="https://github.com/user-attachments/assets/98ab9e35-4487-4207-b57c-37a0fac5dab1" />

### In game example with the overlay
<img width="100%" alt="Screenshot 2026-11-08 163318" src="https://github.com/user-attachments/assets/6ee4d108-cab2-4de7-ab83-4c19acbc5aef" />




## First stable release

Version 1.0.0 brings together the owner-tested compact editor, independent transparent HUD, persistent tray behavior, local recording archive, five interface languages, configurable hotkeys and the approved elven microphone icon. Recordings and draft text stay under your control: the app never sends messages to games automatically.

Development previews remain available from the named artifact on their specific [CI run](https://github.com/nick-sidorin/speak-in-character/actions/workflows/ci.yml).

## How it works

**Square icon and native sizing (v0.13.5):** use a full square blue background,
removing the rounded tile's black corners. On Windows, the native editor now
loads the multi-size ICO directly so the caption/taskbar receive small/large
icons at their system sizes instead of both receiving the 512px PNG. The
approved elven-face/microphone design and existing tray icon remain.

**Approved app icon (v0.13.4):** the executable, native editor and startup
screen now use the owner-approved white microphone inside an elven face
on a blue tile. Preserve the selected face/ears, bold strokes, softly pointed
chin and lowered capsule. The existing tray microphone is unchanged.

**Editor spacing fix (v0.13.3):** remove duplicate header/footer padding in
the production bundle. Explicit Mantine content padding/min-height keeps
the scrolling pane between tabs and footer regardless of CSS chunk order.
The owner confirmed that 0.13.2 no longer shows the grey HUD backing.

**Window defaults and focus follow-up (v0.13.2):** a new HUD starts 24 DIP
from the primary work area's left/top edges. New editors use standard
Electron/Windows placement; valid saved positions still restore. The HUD is
an explicit non-activating toolbar window with minimize/maximize disabled
and no native document caption. This targets the owner-reported grey backing
that returns when focus leaves the editor for a game. The transparent host,
CSS corners and recording emphasis remain unchanged. The owner has since
confirmed that the backing no longer appears; retain the focus regressions.

**Recording emphasis (v0.13.1):** while recording, the HUD bubble becomes
halfway more opaque toward 100%: 30% → 65%, 80% → 90%. It returns to the
saved slider value as soon as recording ends, with a short opacity transition
(disabled for reduced motion). The native host remains fully transparent.

**Startup and identity preview (v0.13.0):** a lightweight, localized loading
screen appears before React/Mantine initialize. The HUD has its own entry and
no longer imports the editor or Mantine; it appears only after the recorder
subscriptions are ready. This reduces duplicate loading, but Electron process
startup still depends on the machine. The executable and editor use a custom
microphone/speech-bubble icon; the existing tray microphone stays unchanged.

**Transparent HUD (v0.12.1):** the HUD uses a fully transparent,
frameless, never-focused host without native rounded corners or a thick frame.
A rounded HTML bubble is painted inside a clear 2px gutter. The 10–100%
slider changes the bubble's CSS opacity, not native window opacity. This
differs from the earlier shared editor/HUD alpha-window attempts. The owner
confirmed that this version resolved the corners on their Windows setup;
preserve it and continue checking inactive/game behavior when changing windows.
The History tab no longer repeats the recording count as a badge.

**Tray preview (v0.12.0):** closing the editor hides it to the system tray;
recording and the HUD stay active. Click the tray icon to reopen the editor,
or right-click for **Open / Quit** (localized to the UI language). **Quit**
and the editor's **Exit** button fully stop the app. Launching again brings
the existing instance forward. At startup the HUD waits for the editor's
first frame instead of appearing on its own before the editor is ready.

**Preview refinement (v0.11.1):** HUD opacity now ranges from **10–100%**,
retaining the 76% default and saved values. Microphone preparation text appears
only after 400 ms to avoid flashing a transient message before recording.
Recording/error status stays immediate; preparation still blocks a second
start. Remaining native HUD corner artifacts are not considered fixed.

**Two-window preview (v0.11.0):** the editor is a standard native window in the
taskbar and Alt-Tab, with normal minimize/maximize/close controls. The separate
HUD stays above other windows, never appears in the taskbar, and does not take
keyboard focus during normal operation or movement. The editor owns the only
recorder, including while minimized; the HUD receives display state only.
The current preview hides the editor to tray on close (the original 0.11.0
preview exited both windows). HUD position/opacity and the existing
`InCharacter` settings/history are preserved. Input examples are allowed as
placeholders; additional context now shows a localized WoW/night-elf example.
Native Windows corner/focus behavior still requires owner validation.

- **Push-to-talk:** hold the configured hotkey to record, release to finish.
- **Recording guard:** accidental presses under **250 ms** are discarded. No audio Blob, recording history entry or OpenAI request is created for these taps. A quick word such as *«давай»* can still be processed.
- **Conservative silence detection:** on recordings of **1.2 seconds or more**, SpeakInCharacter measures the microphone signal **locally**. If there is consistently almost no audio signal, it discards the recording before upload. This is **not a speech recognizer or voice-activity model**: background noise may pass through; exceptionally quiet speech could be discarded. Recordings between 250 ms and 1.2 seconds are **not** rejected by the silence check.
- **Draft protection:** discarded recordings do not replace the previous transcript/reply or appear in History. No API charges are incurred for skipped recordings.
- **One request at a time:** while OpenAI is processing, a new recording cannot begin.
- **Transcription:** `gpt-4o-transcribe` recognizes speech in its original language(s).
- **Rewrite:** `gpt-4.1-mini` generates one natural message in the selected **reply language**. The field is plain text, default **English**; input speech may use other languages.
- **Additional context:** one optional multi-line prompt for the character, speaker quirks, game terms, scene and other disambiguating background. Existing separate character/situation fields are migrated when upgrading.
- **Presets:** optional JSON speech-style presets (Dwarven, Pirate, Courtly). Select the active preset on the **Reply** screen.
- **Style precedence:** preserve the original meaning first; use the chosen preset as a baseline; **Additional context overrides conflicting preset style instructions**, while compatible traits combine. For example, a pirate who stutters can sound both pirate-like and stuttered, but the original transcript is not stylized.
- **Persistent local history:** recordings, audio, transcriptions, translated messages and estimated costs survive app restarts. History is not capped at 15 records; a generous safety limit applies (10,000 managed entries). Audio loads on demand to keep startup memory low. All archive data is stored locally inside the existing `InCharacter` user-data folder.
- **UI languages:** Russian, English, French, Spanish, German, set independently from the reply language.
- **HUD:** a tiny, translucent (content-sized, 44px native host height) click-through status panel with a recording indicator, spinner and completion check. Its position and the main panel's position persist between launches.

**HUD polish (v0.10.2):** compact one-line status, no product-name heading, dynamically measured width, and inside-the-window rounded border. The center panel is the only scrolling region: its scrollbar stays between the native Mantine header and footer. The footer has a subtle 1px divider. System language on Windows uses the actual Windows user UI language from `GetUserDefaultUILanguage`, which may differ from app language preferences; unsupported languages still fall back to English.

**Windows 11 window rendering (v0.10.4):** switched back to an **opaque native frameless window** with Windows-provided antialiased rounded corners. The mini-HUD still uses whole-window 76% opacity. This avoids the confirmed Electron 35 regression where transparent inactive windows show a rectangular ghost title bar. The former native `setShape` mask (pixelated) and the 2px transparent HUD margin were removed. This is a change of rendering strategy; validate its appearance on your Windows machine.

**HUD opacity (v0.10.5):** Settings → Overlay now has a persistent **40–100% HUD opacity** slider (default 76%). It updates the HUD immediately through Electron `setOpacity` and never affects the main editor. On Windows 11 we also restored `WS_THICKFRAME` via `thickFrame: true` to allow native DWM rounded corners without returning to transparent windows and their ghost backing rectangle. Round-corner behavior still needs validation on the user's actual Windows configuration.

## Persistent history and speaking statistics (v0.10.0)

Open **History** to view recordings from **all sessions**, grouped by date, with audio playback, transcript/reply restore, and exports. You can review:

- Total **recordings** accepted, **speaking minutes**, and **recognized words** across all sessions.
- **Estimated combined API costs** (transcription + rewriting). These are estimates, not the actual amount invoiced by OpenAI.
- The number of retained recordings and their **managed audio storage size**.

**Storage:** metadata and lifetime counters live in `%APPDATA%\\InCharacter\\recording-history.json`; audio files are stored in `%APPDATA%\\InCharacter\\recordings\\`. Keeping the original user-data directory name protects saved settings and encrypted API keys across the rename. Data is never uploaded to SpeakInCharacter servers; approved recordings still go directly to OpenAI if API processing is enabled.

**Clean up:** delete a single recording, delete recordings older than 7/30/90 days, or **delete all history, audio and lifetime statistics**. Every destructive action requires confirmation. Removing individual/older audio **does not reset lifetime counters**; clearing absolutely everything resets them. Deletion only touches managed audio inside the app's own folder and metadata. Separately exported audio files are **never** automatically removed.

**Upgrades:** prior versions stored recordings only in volatile memory, so entries from sessions that ended before v0.10.0 cannot be recovered automatically. The new archive starts recording on first use of v0.10.0.

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
- **Clipboard:** the result is copied locally; SpeakInCharacter **does not** send messages into games or chats automatically.
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
npm ci
npm run typecheck
npm run build
npm run dev
```

To package on Windows: compile `native/hotkey.cs` into `native/hotkey.exe` using the .NET Framework C# compiler, then run `npm run dist:win`. The GitHub Actions Windows workflow performs those steps for you.

**CI policy:** pull requests run TypeScript/build checks, native Windows hotkey tests, UI-language validation and full Windows x64 packaging. The required aggregate check is **`CI / required`**; both jobs must succeed. Regular pushes to `main` do **not** trigger builds or public releases. Manual preview workflows remain available. A stable `vX.Y.Z` tag on a commit in `main`, matching `package.json`, triggers the release workflow. It reruns the same CI against that tag and publishes the portable ZIP and `SHA256SUMS.txt` only after all checks pass. Release notes live in `.github/release-notes/`; reruns can select the existing tag through `workflow_dispatch`. Dependencies are pinned by `package-lock.json`.

Licensed under MIT.

**Windows alpha-corner caveat:** Electron/Windows DWM may display an inactive rectangular frame behind transparent rounded corners on some Windows 11 builds. v0.10.2 disables native rounded corners while retaining CSS-rendered rounded content; this is an experimental mitigation, not a confirmed fix on every GPU/Windows configuration.
