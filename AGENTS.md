# AGENTS.md — SpeakInCharacter

These instructions apply to the entire repository. Read [`docs/product-context.md`](docs/product-context.md), [`README.md`](README.md), and [`docs/design-direction.md`](docs/design-direction.md) before making nontrivial changes. Treat the repository and current GitHub state as the source of truth for implementation details; the product-context document explains intent and decisions, not necessarily today's code.

## Mission and product invariants

SpeakInCharacter is a **Windows voice companion**, initially built for roleplaying in World of Warcraft: Forever but deliberately usable elsewhere. The user holds a hotkey, speaks naturally in one or more languages, releases the key, reviews an AI-rewritten/translated line, and **manually** pastes and sends it.

- **Preserve the speaker's meaning and authorship.** Never invent new statements, intentions, facts, actions, emotions, or lore. Style presets change voice, not substance. Keep short statements short.
- Keep speech recognition, output language, UI language, style preset, and additional context conceptually separate. Never hardcode Warcraft-specific assumptions into the neutral AI prompt.
- Do **not** automatically send text to games, simulate gameplay, read game memory, or expand keyboard capture into general keylogging.
- Respect local data, saved API credentials, history, and backward compatibility with the historical `InCharacter` user-data directory.
- Prioritize predictable hotkeys and in-game focus behavior over clever implementation shortcuts.

## Repository language and collaboration

- **English is the repository working language:** documentation, code comments, commit messages, branch names, PR titles/descriptions, and changelogs. Localized UI strings remain in their respective target languages.

- **Never commit or push directly to `main`.** Changes reach it only through a focused feature/fix branch and PR. Preserve unrelated user changes; check `git status` before modifying files.
- Use **Squash and merge** only. Do not force-push protected branches or bypass GitHub rulesets. Do not merge a PR or publish a release without explicit user approval for that action. When that approval is already present, complete the authorized action after its checks pass without asking for the same approval again; it does not authorize other PRs or releases.
- Ensure PR status checks pass before proposing a merge. Read the *actual* ruleset and actual check names rather than assuming a particular required check is already configured.
- Make small, reviewable changes with a regression test for each meaningful bug fix whenever feasible. Avoid opportunistic rewrites, large dependency additions, and unrelated formatting churn.
- For a UI/HUD change that requires Windows visual validation, make the build or PR available and clearly describe the manual checks; **do not claim a visual bug is fixed based on CI alone**.
- In direct conversation with the owner, use concise, friendly **Russian**. For repository content, follow the English-only rule above. Report what changed, what ran, and what still needs verification; skip noisy file-by-file narration.

## Technical boundaries

- Electron + React + TypeScript + Vite + Mantine; native Windows keyboard behavior lives in `native/hotkey.cs`. Learn the actual current versions from `package.json`.
- `electron/main.ts`: windows, lifecycle, hotkeys, IPC. `electron/ai.ts`: transcription and rewriting. `electron/history.ts`: archive. `electron/presets.ts`: preset loading. `src/App.tsx`: renderer UI. `src/i18n.ts`: translations. Paths can evolve; search before assuming.
- Keep privileged operations in Electron's main process behind narrowly scoped, validated IPC. Do not expose Node capabilities or secrets to the renderer.
- Never commit API keys, recordings, user-specific data, built binaries, or generated local artifacts. No new telemetry without an explicit product decision.
- Windows helper must intercept only configured shortcuts, not log arbitrary keys. Preserve correct re-arming on both primary-key and modifier release; repeated `Ctrl+Shift+O` / `Ctrl+Shift+M` must work.
- Recordings under **250 ms** are discarded; long near-silent audio is conservatively filtered locally; skipped recordings must not be uploaded, added to history, or replace an existing draft. Check current thresholds in code before changing them.
- Preserve local history, playback, deletion safety, retained lifetime metrics, and distinction between deleting archived entries and resetting all statistics.

## UI and interaction rules

- **Use stock Mantine components and native theme behavior first.** Do not resurrect old global Mantine overrides or invent a parallel CSS component system. `src/styles.css` should focus on desktop-window/HUD necessities.
- Keep the interface **compact and self-explanatory**. Remove redundant captions, helper paragraphs, repeated descriptions, and instructional clutter. Prefer clearer labels and tooltips where help is genuinely necessary; retain important errors and irreversible-action confirmations.
- Do not repeat tab names as content headings. Placeholders may show a short, concrete example of valid input (for example, additional context); avoid placeholders that merely explain what an empty field will display. Retain field labels and accessible names for icon actions. Help should address a concrete, non-obvious interaction; cost labels must describe the displayed estimate accurately.
- Main editor: fixed tabs/header, scrollable **central pane only**, fixed footer, one appropriate separator. Scrolling must not extend behind tabs or footer; switching tabs should not leave stale scroll offsets.
- Respect independent UI and reply languages and all five supported UI locales (`en`, `ru`, `fr`, `es`, `de`). Any new visible copy must be translated for all five.
- HUD is a small, independent, focus-safe overlay; its position and opacity persist. Its opacity affects only the HUD. Respect the existing drag and hotkey behavior.
- The requested two-window model uses a normal native editor window in the taskbar/Alt-Tab and a separate non-focusable, taskbar-hidden HUD. The editor owns the sole microphone/processing pipeline, including while minimized; the HUD receives only display state. Do not mount a second recorder or share API keys/audio with the HUD. Keep the historical `panel`/`hud` position keys.
- Closing the editor hides it to a persistent system tray; it must keep recording/HUD state alive. Tray click/Open and a repeated launch restore the same editor. Only explicit Quit/Exit or OS shutdown fully closes the app. Do not hide the editor to tray if tray creation failed. Show the editor before the HUD on startup without inventing claims that rendering latency is fixed.
- **Be very cautious with Windows 11 HUD corners.** Electron alpha windows, native shapes, DWM hints, and `thickFrame` have all produced different artifacts. Read relevant commit history before changing the window strategy. Validate the current window model in inactive windows, light/dark themes, and real in-game visibility on Windows. Never regress the rectangular ghost backing panel.
- The owner authorized the 0.12.1 transparent-host experiment: a never-focused, frameless HUD with a clear gutter and CSS-rendered inner bubble. Keep native host opacity at 1; apply the saved 10–100% opacity only to the bubble. Editor theme changes must never paint the HUD host. Renderer alpha tests do not prove Windows DWM corners are fixed. History counts stay inside the tab content, not in its tab badge.
- Share preview downloads through the specific GitHub Actions run and its named artifact. Temporary ChatGPT-hosted download links have failed for the owner. Treat Chrome download blocking and Defender scan results as distinct observations; do not claim a proven cause or a safety guarantee from a clean scan, and do not disable protections to make a build downloadable.

## Checks and working method

1. Inspect `git status`, current branch, relevant docs, and affected code. Look for an existing PR before starting overlapping work.
2. State the minimal intended change and any uncertainty; implement only what the request authorizes.
3. Run the checks supported by the current branch: usually `npm run typecheck`, `npm run build`, and, when available, `npm run check` / `npm test` / `npm run test:coverage`. Consult `package.json` rather than assuming scripts exist.
4. Windows-specific behavior requires the native helper self-test, full Windows x64 package verification, and—where relevant—manual real-Windows testing. Linux CI is not equivalent to a Windows UI test.
5. Create/update a focused PR. Summarize verification, risks, and anything the owner must confirm. **Stop before merge or release unless the owner has already explicitly authorized that action.** An authorized merge still requires the real required checks and any applicable Windows validation; leave other PRs open.

## Project history

For product rationale, known pitfalls, and a **dated** handoff snapshot (including the original HUD/CI work), see [`docs/product-context.md`](docs/product-context.md). Re-check open PRs, branch protection, and current source rather than treating old status notes as live instructions.
