# SpeakInCharacter

**Speak naturally. Stay in character.**

SpeakInCharacter is a Windows voice companion for roleplay and everyday chat. Speak in any language (including Russian/English mixtures); OpenAI transcribes your voice and rewrites the **same message** in your chosen language and character style. Review the result, then paste it manually wherever you want.

> **Current development version: 0.13.5 (unreleased)** · Windows x64 · unsigned prototype

## Download and run

**[Download the latest Windows Preview from GitHub Releases](https://github.com/nick-sidorin/speak-in-character/releases)** — no GitHub Actions navigation required.

1. Download the current published **v0.8.2** asset, `InCharacter-v0.8.2-Windows-x64-portable.zip`. The new SpeakInCharacter executable name will appear starting with v0.9.0.
2. **Extract the whole ZIP** to a folder and launch `InCharacter.exe` (in v0.8.2). Upcoming releases will use `SpeakInCharacter.exe`. Visual Studio and Node.js are **not** needed.
3. For game overlays, use **borderless/windowed fullscreen** rather than exclusive fullscreen.
4. The current preview opens a normal editor window plus a separate HUD. Configure your personal OpenAI API key in **Settings**. **Ctrl + Shift + O** restores/minimizes the editor; API billing is separate from ChatGPT. The older published v0.8.2 still uses the original single-window behavior.
5. Hold **Caps Lock**, speak, then release. The translated line goes to the clipboard; review and paste it with **Ctrl + V** into chat, then send manually.

Development builds are also available on [GitHub Actions](https://github.com/nick-sidorin/speak-in-character/actions/workflows/windows.yml), but public downloads should use **Releases**.

Unsigned builds may trigger a Windows SmartScreen warning. This project is still undergoing testing on real Windows/game setups.

**Existing users:** the rename keeps the original local data directory for compatibility, so your encrypted API key, presets, hotkeys, and past window positions remain available. Existing language choices are respected. New users get their Windows display language automatically (English fallback); in Settings, choose **System language** to follow Windows again.

**UI update (v0.9.0):** the editor now uses the free MIT-licensed Mantine component library with a Mantine's native dark and light theme. In Settings you can choose **System / Dark / Light**; the choice persists, and System follows live Windows light/dark changes. The in-game HUD intentionally retains its compact independent styling.

**Release note:** v0.8.2 remains the currently published release until the redesigned v0.9.0 build is reviewed.

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
- **HUD:** a tiny, translucent (~254 × 54 px) click-through status panel with a recording indicator, spinner and completion check. Its position and the main panel's position persist between launches.

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
npm install
npm run typecheck
npm run build
npm run dev
```

To package on Windows: compile `native/hotkey.cs` into `native/hotkey.exe` using the .NET Framework C# compiler, then run `npm run dist:win`. The GitHub Actions Windows workflow performs those steps for you.

**CI policy:** pull requests run TypeScript/build checks, native Windows hotkey tests, UI-language validation and full Windows x64 packaging. The required aggregate check is **`CI / required`**; both jobs must succeed. Regular pushes to `main` do **not** trigger builds or public releases. Downloadable previews and releases use the separate manual workflows.

Licensed under MIT.

**Windows alpha-corner caveat:** Electron/Windows DWM may display an inactive rectangular frame behind transparent rounded corners on some Windows 11 builds. v0.10.2 disables native rounded corners while retaining CSS-rendered rounded content; this is an experimental mitigation, not a confirmed fix on every GPU/Windows configuration.
