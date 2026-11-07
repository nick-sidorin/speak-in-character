# SpeakInCharacter — product context and decision log

> **Purpose:** preserve the product intent, tested lessons, preferences, and trade-offs across ChatGPT/Codex sessions. This is **not** a replacement for the current repository, source code, issues, or PRs. Historical/current-state details are explicitly dated. Review this alongside `AGENTS.md`, `README.md`, and `docs/design-direction.md`.

## 1. Product vision

**Speak naturally. Stay in character.**

SpeakInCharacter is a lightweight Windows desktop voice companion that makes spontaneous roleplay conversation practical when the player is more comfortable speaking a different language from the game's chat language. It began around **World of Warcraft: Forever**, especially international RP servers, but is meant to work for any game or conversational setting.

### Primary flow

1. While playing, hold a configurable push-to-talk shortcut (initial default: `Caps Lock`).
2. Speak a message in Russian, English, or a mix of languages.
3. Release the shortcut to end recording.
4. Speech is transcribed, then rewritten or translated into the user-selected **reply language**, optionally adopting a selected roleplay style.
5. The result is displayed for review and copied to the clipboard.
6. The player **manually** pastes and sends it. The application does not submit chat messages on the player's behalf.

The app should feel invisible during play: no fighting over focus, no unexpected keyboard actions, and as little menu friction as possible.

### Success criteria

- A player's message is recognizable as **their own thought**, even after translation and styling.
- Quick replies are quick; the output is natural, concise, and ready to paste.
- An overlay communicates status without interfering with the game.
- Basic use is approachable without reading instructions under every control.
- Recordings and transcripts are private, recoverable locally, and explicitly removable.

## 2. Non-negotiable AI behavior

**The assistant is a translator/stylist, not a co-author or autonomous character.**

Preserve original facts, communicative intent, register, humor, emotional intensity, profanity where appropriate, and ambiguity. Avoid unnecessary embellishment, melodrama, added lore, roleplay actions, or unsolicited paragraphs. A short colloquial utterance should remain short and colloquial in the destination language. Prefer idiomatic output over word-for-word translation without altering the meaning.

Recognize code-switching and game-specific vocabulary. User-supplied additional context and preset recognition hints can disambiguate names (e.g., localized WoW place names that refer to **Ironforge**). Do not silently invent official translations of uncertain names.

### Instruction hierarchy for style

1. Meaning and authorial intent of the recorded utterance are protected.
2. The user's explicit **Additional context** takes precedence in a style conflict.
3. The selected preset establishes a baseline style; compatible traits combine.

A pirate preset may influence wording, but must not insert ships, rum, or backstory absent from speech. The source transcript itself remains faithful rather than retroactively stylized.

The neutral transformation prompt must not contain built-in Warcraft, dwarf, or other setting-specific assumptions.

### Model and API approach (historical implementation)

- Speech-to-text: `gpt-4o-transcribe`.
- Text transformation: `gpt-4.1-mini`.
- User supplies their own OpenAI API key; API billing is separate from ChatGPT.
- The app estimates usage cost; estimates are **not** invoices or authoritative billing records.
- The stored API key is secured with Electron `safeStorage` / Windows DPAPI. Do not introduce cloud storage, shared keys, analytics, or remote history without an explicit decision.

Treat model names and prices as **implementation snapshots**, not permanent requirements. Proposed changes should consider quality, latency, pricing, behavior regression, and explicit owner approval.

## 3. Language model and presets

Three independent concepts must stay separate:

| Concept | Meaning |
| --- | --- |
| UI language | The language of menus, labels, and settings |
| Reply language | The language in which the final spoken message is rendered; user-entered text, historically defaulting to English |
| Speech style | Optional preset plus user-authored additional context |

Existing UI languages: **English, Russian, French, Spanish, German**. UI system-language selection should follow the **actual Windows user display language**, not an unrelated browser/process locale; unsupported UI languages can fall back to English. Dark/light/system appearance follows its own setting.

Speech presets are independent UTF-8 JSON files, with bundled examples such as **Dwarven**, **Pirate**, and **Courtly**. Users can add or override presets in their personal presets folder and reload without rebuilding the app. `presets/README.md` documents the schema and precedence. Built-in presets should stay examples, not mandatory product identity.

## 4. Recording and clipboard behavior

- Hold-to-record; release-to-process.
- Default bindings at the time of handoff: `Caps Lock` (record), `Ctrl+Shift+O` (toggle editor), `Ctrl+Shift+M` (move HUD). User-configurable bindings replace these defaults.
- Very short accidental presses **under 250 ms** are discarded.
- Conservative **local signal-level** near-silence detection is used for recordings of about **1.2 seconds or longer**; this is not speech recognition or a learned voice-activity classifier. Quiet speech may be missed and background noise may pass.
- Skipped recordings cause **no** API request and must not wipe the previous useful result or create archive entries.
- Only one recording/request pipeline runs at a time.
- A valid result is locally copied for review and manual pasting; there is **no** automatic chat send.

### Windows keyboard helper

The C# low-level keyboard hook should suppress **only assigned shortcuts**. It must not capture ordinary typing as telemetry or synthesize game commands. Key-down/up and modifier-release behavior matter: repeated panel and HUD shortcuts have previously failed and now have regression tests. Applications running as administrator, raw-input games, secure desktop, or competing global shortcuts may behave differently; communicate these limitations accurately.

## 5. Desktop UI philosophy

The UI has undergone substantial redesign. A key decision was to **stop mixing stock Mantine UI with extensive legacy CSS overrides**. Those overrides caused light-theme inputs to stay dark/green, mismatched controls, uneven spacing, duplicate separators, and tab alignment errors.

### Editor

- Use stock **Mantine** components and its native theming, spacing, typography, radii, and semantic controls.
- Standard structure: fixed **AppShell header/tabs**, independently scrolling **central pane**, fixed **footer**.
- Scrollbar starts **below the tabs** and ends **above the footer**; never scroll the entire window under fixed chrome.
- Maintain a single intentional separator at each boundary rather than stacked lines.
- Reset/restore sensible scroll behavior on tab changes.
- Supports **System / Dark / Light** appearance selection; light mode must actually look light.
- `src/styles.css` should remain limited to actual desktop-window and HUD exceptions, not broad `.mantine-*` patches.

### Information density

The owner strongly prefers **compact, self-explanatory UI**, with the density of a practical tool rather than a tutorial. Avoid gratuitous descriptions beneath controls, duplicate helper copy, or instruction paragraphs. If a control can be understood from its label, it usually needs nothing more. For genuinely unfamiliar operations, use a concise tooltip or clearer naming. Keep actionable errors, accessibility affordances, and meaningful destructive-action confirmation.

### HUD overlay

The mini HUD is separate from Mantine, so it stays minimal, fast, and visually unobtrusive while the player is in-game. Requirements include:

- Status for recording, processing, and completion (compact one-line treatment, no product title).
- Width measured against displayed localized content rather than arbitrary oversizing.
- Configurable position (remembered between launches) and a distinct HUD-move shortcut.
- No unexpected focus stealing; intended game-overlay use with windowed/borderless fullscreen.
- HUD-only opacity setting **10–100%** in the 0.11.1 work-in-progress (previously 40–100%), initially **76%**, persistent and applied immediately.
- Rounded corners that actually look good on Windows 11 without an opaque rectangular artifact behind them.

### Windows corner history — do not repeat failed experiments casually

Different rendering strategies were explored: CSS `border-radius`, transparent alpha Electron windows, Win32 window shapes, and native DWM rounding. Problems included pixelated shapes, square edges, and a visible **rectangular inactive/ghost title-bar backing** behind apparently rounded transparent content. The project moved to an **opaque frameless HUD**, with `setOpacity` for whole-window transparency and Windows DWM rounding attempts. `thickFrame: true` was used to allow native rounded corners. A further DWM-corner request is in PR #1 as of handoff.

**The visual issue was not yet conclusively solved.** Successful compilation and passing CI cannot certify it. Check actual corner appearance, inactive state, both color schemes, behavior behind the window, moving HUD, and game focus on a real Windows 11 system. Review prior relevant commits before swapping transparency/windowing strategies.

## 6. Archive, privacy, and accumulated statistics

History is a durable **local** archive, not a short in-memory list. It includes audio recordings, source transcript, resulting text, estimated API cost, playback, restore/review, and export.

Lifetime metrics include:

- accepted recording count;
- total speaking time;
- recognized word count;
- estimated cumulative API cost.

Retained entry count and managed audio disk size are separate current-storage
metrics; they decrease with cleanup while lifetime metrics are retained.

The local metadata historically lives at `%APPDATA%\InCharacter\recording-history.json`; audio under `%APPDATA%\InCharacter\recordings\`. **The legacy `InCharacter` user-data name is intentionally retained** after the application was renamed to SpeakInCharacter, protecting previous settings, hotkeys, API credentials, and saved window positions.

### Deletion semantics

| Action | Expected effect |
| --- | --- |
| Delete one entry | Remove its managed archive metadata/audio, without resetting lifetime metrics |
| Delete older entries (7/30/90 days) | Purge matching managed history/audio; keep lifetime metrics |
| Delete **all history and statistics** | Require explicit confirmation; remove managed entries/audio and reset lifetime counters |
| Export an audio file elsewhere | Do not delete the external export during archive cleanup |

Avoid races between recording, playback, editing, and deletion. Never delete arbitrary files outside the app-controlled archive. An accepted recording may be sent to OpenAI for transcription; its transcript/context/preset instructions may be sent for rewriting. Do not imply that accepted processing is entirely offline.

## 7. Platform scope and build philosophy

- Primary target: **Windows x64**, currently packaged as an unsigned portable prototype.
- Electron main process and validated IPC handle privileged operations; React renderer should not access OS secrets or unrestricted Node APIs.
- Native C# helper implements Windows-specific key routing, including a self-test.
- Builds use TypeScript checks and Electron packaging; CI should exercise native helper behavior and verify packaged executable/resources.
- Manual Windows preview/release workflows are distinct from PR merge-gating CI. No need to publish a hefty public build for every push to `main`.
- Keep the product simple and dependable before adding complex native features or extra infrastructure.

### Release identity and migration

The project was previously named **InCharacter**. Public v0.8.2 assets and executable used that name; later builds move to **SpeakInCharacter**. This is not permission to move legacy user data or discard existing settings. On the original 0.10.5 `main`, `release.yml` verified `SpeakInCharacter.exe` but then searched for `InCharacter.exe` when creating the ZIP. The resulting wrong-directory selection was reproduced; PR #1 fixes it with packaging regression tests. Until that PR is merged, the defect still exists on `main`.

## 8. Development and quality preferences

The owner is an experienced software engineer, not a novice who needs generic Git explanations. Direct conversation with the owner should be friendly, concise, and in **Russian**. **All repository documentation, code comments, commit messages, branch names, PR descriptions, and changelogs must be written in English**; naturally, localized UI strings use their actual target languages. The desired AI collaboration style is proactive implementation with restrained changes, appropriate testing, and short explanations.

- Favor small, focused, reviewable PRs.
- Protect `main`; do not commit directly to it or bypass branch rules.
- Use **Squash and merge**, preserving linear history.
- Add targeted regression coverage for meaningful bug fixes.
- Avoid comment clutter and gratuitous settings/help text.
- Discuss architectural changes, new dependencies, model changes, privacy impact, or risky migration before implementing broadly.
- Distinguish automated checks from real OS/game visual/behavioral verification.
- Do not merge or release without owner approval.

## 9. State at initial handoff — **2026-11-07** (historical snapshot)

The repository was `nick-sidorin/speak-in-character` on GitHub. `main` identified development version **0.10.5** (unreleased); README still pointed to published **v0.8.2** as the public download. **Do not assume these versions remain current.**

### PR #1 — in progress

[PR #1: “CI: required tests & Windows build + cleaner UI and rounded HUD experiment”](https://github.com/nick-sidorin/speak-in-character/pull/1) — branch `ci/required-tests-and-windows-build`.

At the dated snapshot, this PR introduced:

- PR-triggered Linux TypeScript / Vitest unit tests and coverage thresholds;
- native Windows helper self-tests and OS UI-language checks;
- complete Windows x64 Electron package verification;
- a combined gate **`CI / required`** that succeeds only if unit and Windows jobs succeed;
- removal of redundant explanations across Reply, History, Settings;
- an experimental native DWM rounded-HUD request.

The initially reported 17 regression tests and ~90.97% line / ~76.63% branch coverage referred to **selected covered modules**, not the entire app. The referenced CI workflow completed successfully ([run](https://github.com/nick-sidorin/speak-in-character/actions/runs/42302933046)). The PR remained open awaiting the owner's live Windows visual check.

### GitHub ruleset mismatch

The active `Protect main — PR + CI` ruleset required a legacy check named **`build`**, not the new aggregate **`CI / required`**. Therefore, successful CI did **not** by itself prove the ruleset was configured for the new workflow. Recheck live GitHub settings and change the required check accordingly if the mismatch remains. The ruleset otherwise selected PRs, squash-only merge, linear history, no force-push/deletion, and no bypass actors at the time.

### Follow-up review — **2026-11-07**

This update supersedes the initial operational snapshot above; it does not
mark unmerged changes as implemented on `main`.

- Before this documentation PR is merged, `main` is still **0.10.5**, commit
  `12eb1e8`; the public download remains **v0.8.2**.
- PR #1 is still open. Its **0.10.6 preview**, commit `548446d`, passed
  [CI run 42371526700](https://github.com/nick-sidorin/speak-in-character/actions/runs/42371526700).
  It includes further compact-copy cleanup, **20 tests**, **92.85% lines /
  78.76% branches** for selected modules, a fix for orphan audio surviving
  full purge, and the release ZIP fix. These fixes are pending merge.
- The owner corrected the active `Protect main — PR + CI` ruleset. The
  required check is now **`CI / required` from GitHub Actions** (app ID
  `15368`), with up-to-date branches, PRs, squash-only merging, linear
  history, force-push/deletion protection, and no bypass actors. This was
  read back from GitHub; the original `build` mismatch is resolved.
- This documentation PR introduces `.github/workflows/ci.yml` so the current
  `main` code can produce that required check before PR #1 lands. It runs
  Linux TypeScript/build checks plus Windows keyboard self-tests, UI-language
  validation and full x64 packaging. It does not fabricate a status or skip
  an available test suite: Vitest is not yet on this branch. PR #1 adds its
  Vitest coverage gate and downloadable PR preview artifacts.
- The compact 0.10.6 renderer was reviewed in Chromium with mocked Electron
  IPC across **five locales, two themes and three tabs**. Labels, horizontal
  overflow, scroll boundaries/reset and deletion confirmations were checked.
  This is not a Windows-native HUD, focus or keyboard-hook test.
- The owner reports Chrome blocks the newer ZIP even when downloaded from
  GitHub Actions. A supplied Windows Defender custom-scan result reports
  **0 threats**. The Chrome verdict's cause remains unknown; a false positive
  or file-reputation/heuristic issue is a hypothesis, not an established
  diagnosis. The earlier 0.10.5 preview and current preview are unsigned.
  Do not attribute the verdict to the DWM change without evidence.
- Provide the **GitHub Actions run page and artifact name** for previews.
  Direct temporary ChatGPT download links failed and should not be the
  default. A rebuilt ZIP does not guarantee Chrome will accept it.
- UI rules now explicitly exclude repeated tab headings, instructional
  textarea placeholders and duplicate captions. Keep clear field labels,
  accessible icon names, operational errors, fallback warnings and deletion
  confirmations. Label lifetime API totals as estimates rather than a
  current-session bill.
- The owner authorized review, correction and **squash merge of documentation
  PR #2**. That authorization does not extend to PR #1 or a public release.
  Keep application updates outside `main` until their CI and relevant owner
  Windows review are complete.

### Two-window follow-up — **2026-11-07** (work in progress)

The owner tested the compact 0.10.6 preview, reported successful downloading
and approved its quieter appearance. The earlier rectangular ghost backing
is no longer observed, but dark corner regions remain. This is owner feedback,
not confirmation that every native-corner issue is solved.

The owner explicitly requested a new window architecture: open a normal
taskbar/Alt-Tab editor at startup and keep a separate always-on-top HUD without
a taskbar entry. The 0.11.0 work-in-progress follows that model. The editor is
the sole recording/processing owner and keeps working while minimized; the
HUD is a non-focusable display client with a restricted IPC bridge. Native
editor close exits the app. Both historical position keys and existing local
data remain compatible. The HUD stays opaque while the split is validated;
this change does not by itself prove its native corners are fixed.

The placeholder preference is refined: short examples of input are useful,
especially `Example: World of Warcraft, night elf woman` for additional
context. Omit redundant instructions, not useful examples or field labels.
Translate examples across all five UI languages. The window-architecture
change requires its own PR, CI and real Windows testing before merge.

The owner subsequently reported the 0.11.0 two-window preview works, while
native HUD corner artifacts remain. The 0.11.1 follow-up lowers the opacity
minimum to 10% and delays only microphone-preparation presentation for 400 ms
to avoid a fast flash before recording. It does not change the capture/start
guards or claim to fix the corners.

The owner then requested Discord-like background behavior. The 0.12.0
follow-up keeps one tray icon while running, hides the editor on native close,
restores it from tray click/Open or a second launch, and quits fully only
through explicit Quit/Exit or OS shutdown. Hidden recording uses the same
renderer and pipeline. The two windows previously showed independently on
their first frame; the lighter HUD could appear first. Startup now reveals
the editor before the HUD. This coordinates presentation, not proof that
renderer startup itself is faster. Native HUD corner artifacts remain open.

The owner confirmed tray behavior works and asked to remove the redundant
History tab count badge. They explicitly proposed a fully transparent native
host with a separately painted rounded inner HUD. The 0.12.1 experiment uses
the dedicated non-focusable host with no thick frame/native rounding hint,
a transparent 2px gutter, and CSS opacity on the inner bubble instead of
native `setOpacity`. The earlier shared-window alpha attempts also switched
roles/focus and applied whole-window opacity. This new combination
was subsequently confirmed by the owner to resolve the HUD corners on their
Windows setup (2026-11-07). Preserve that window configuration; a transparent
renderer screenshot remains a regression guard rather than proof for every
Windows compositor.

The 0.13.0 follow-up addresses the owner's reported 3–4 second startup wait.
Both windows had imported the full editor/Mantine bundle. Separate editor
and HUD entries remove that duplicate work. A lightweight localized editor
loading screen paints before React/Mantine initialization; HUD visibility
waits for both the editor first frame and recorder event subscriptions.
This does not promise a fixed cold-start time. Windows smoke logs navigation
marks separately from process startup. The app now uses a custom vector
microphone/speech-bubble mark for its executable/editor icon; the owner liked
the existing tray microphone and it is intentionally unchanged.

The owner requested Discord-inspired recording emphasis in 0.13.1: the HUD
bubble opacity rises halfway from the saved baseline to 100% only while
recording (30 → 65%, 80 → 90%). It returns to the saved value on release,
including processing, completion or error. A short CSS opacity transition
respects reduced motion. This is recording-state feedback, not voice-activity
detection, and does not change the setting, native host or main window.

### What the next agent should do first

1. Read `AGENTS.md`, this document, README, design direction, `package.json`, and the current GitHub PR/CI/ruleset state.
2. Look at the working tree and current branch before changing anything.
3. Check whether PR #1 remains open, whether the required check mismatch persists, and whether its HUD experiment has been visually tested on the owner's Windows computer.
4. Do **not** merge PR #1 without explicit approval and the owner's Windows feedback.
5. Preserve product invariants while continuing whichever new task the owner requests.

## 10. Decisions versus open questions

| Area | Decision | Open / needs validation |
| --- | --- | --- |
| AI output | Preserve meaning; style is secondary | Improve fidelity with targeted cases/feedback |
| Game interaction | Clipboard + manual send, no automation | Game-specific focus/hotkey conflicts |
| UI | Mantine-native, compact, minimal descriptions | Real-device visual regressions |
| HUD | Minimal separate window; adjustable opacity and position | Windows 11 corner artifacts and inactive backing |
| Language | Five UI locales, independent reply language | Future locales only if demand warrants |
| History | Persistent local audio/transcripts and lifetime metrics | Retention/performance at large volumes |
| Git workflow | PR-only, `CI / required`, squash merge | Recheck live settings when they change; never bypass protection |
| Release | Manual Windows artifact/release process | ZIP rename fix is tested in PR #1, pending merge; Chrome verdict remains unexplained |

**Maintenance rule:** Update this document when a real product decision changes. Put ephemeral release/PR status into a dated section; never overwrite historical context as though a proposed fix had already been proven.
