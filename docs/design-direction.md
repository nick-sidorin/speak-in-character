# SpeakInCharacter — Mantine-native interface

## Decision (v0.10.1)

The previous implementation mixed old project-wide CSS with Mantine components.
It caused input fields to retain dark/green colors in light mode, mismatched
button colors, misaligned Tabs, unexpected separator lines, and uneven spacing.
That design is retired.

The editor is now built from **stock @mantine/core components**:

- `AppShell`: fixed header, scrolling editor content and fixed footer;
- `Tabs`: Reply / History / Settings, with proper left and right sections;
- `Grid`, `SimpleGrid`, `Stack`, `Group`: spacing and columns;
- `Paper`, `Text`, `Title`, `Divider`, `Badge`, `Code`: surfaces and type;
- `TextInput`, `Textarea`, `PasswordInput`, `Select`, `SegmentedControl`, `Switch`: input;
- `Button`, `ActionIcon`, `Modal`: actions and confirmation.

The theme is defined in `src/theme.ts` and uses **Mantine's native indigo and
neutral palettes**, typography, sizes and radii. System / Dark / Light is
managed through the Mantine color-scheme provider.

We intentionally removed `src/mantine-theme.css` and rewrote
`src/styles.css` as a small window/HUD layout stylesheet without selectors
for Mantine component internals. Changing an input color should not require
another custom CSS rule.

## Desktop-specific exceptions

The editor uses a standard native Windows frame and participates in taskbar
and Alt-Tab switching. The HUD is a separate, non-focusable always-on-top
window hidden from the taskbar. A little custom behavior is necessary for:

1. HUD dragging, click-through and configured keyboard shortcuts;
2. the compact, content-sized HUD and its independent opacity;
3. preventing text selection on non-editable UI;
4. scrolling the central pane without moving the header/footer.

The editor has no CSS clipping of its native window corners and does not stay
above the game. Both windows exist from startup. Minimizing/restoring the
editor never hides or reloads the HUD. Native editor close hides it to the
system tray; both close-to-tray and minimize keep recording available.
Tray click/Open restores the existing editor; Quit/Exit fully stops the app.
The tray exists throughout the running session and follows the UI language.
Repeated launches activate the existing instance. The HUD waits for the
editor's first frame and recorder subscriptions at startup. A minimal localized
loading screen paints before the editor's React/Mantine bundle initializes.
It uses scoped startup CSS only in the editor entry; the HUD loads separately
and must never import this opaque screen or Mantine. Keep both renderers'
startup independent while preserving the editor's existing localStorage URL.
Without saved positions, let Electron/Windows place the editor normally;
start the HUD 24 DIP from both left and top of the primary work area. Valid
saved positions take precedence and disconnected-monitor positions recover
to these defaults. Do not scale this margin as a percentage of screen size.
Ctrl+Shift+O brings an unfocused editor forward or minimizes the active editor.
The editor renderer owns the only recorder; the HUD receives a validated
display snapshot through the main process. Its bridge has no audio, key,
history or AI operations.

The owner explicitly requested a transparent-host experiment after the
separate opaque HUD still showed dark corners. In 0.12.1 the host uses
per-pixel transparency with no native frame, shadow, thick frame, DWM rounded
hint or shape mask. A 2px clear gutter surrounds the HTML bubble. Its CSS
border radius and opacity own the visible contour; do not call native
`setOpacity` or paint a theme background into this host. It stays non-focusable
even during movement. The editor remains a separate opaque native window.
The owner confirmed on 2026-11-07 that 0.12.1 resolved the corners on their
Windows setup in initial testing, but subsequently identified a grey backing
when focus leaves the editor for the game. The 0.13.2 follow-up keeps the
alpha/CSS strategy and makes the host an explicit non-activating toolbar,
with native minimize/maximize disabled and document-title updates suppressed.
The owner subsequently confirmed that the backing no longer appears in
0.13.2. Preserve these native options and empty caption.
Preserve the transparent contour configuration. Renderer alpha checks guard
regressions, while Windows desktop composition still needs real-machine
checks when changing the window strategy.

During the actual `recording` phase, emphasize the bubble by raising its
opacity halfway toward 100%: `base + (100 - base) / 2`. Other phases use the
saved slider value. This is a 180ms CSS transition (none for reduced motion),
never a change to the stored setting, native host opacity, or editor. Keep
the red recording indicator; emphasis follows recording, not voice activity.

The owner-approved 0.13.4 app mark is a white microphone inside a slender
elven-face outline on a blue tile: long sharp ears with curved lower lobes,
a softly pointed chin and bold consistent strokes. The capsule is slightly
lowered to balance the side/bottom cradle gap. `assets/app-icon-source.png`
retains the approved symbol on the subsequently requested square blue
background, with no rounded tile corners, black backing or alpha channel.
Windows must load the ICO itself for the native editor: Electron selects
HICON sizes using the system small/large icon metrics. A PNG path creates
one oversized HICON that Windows then resamples. PNG is for startup and
non-Windows windows; the ICO is also embedded in the executable. Do not redraw
or substitute an earlier review variant. Keep the existing tray microphone
unchanged. This artwork does not add game-specific assumptions to AI prompts.

The product is **inspired by the density of Discord**, not a Discord theme,
clone, component library, brand, or collection of extracted assets.

## Compact UI copy

- Use one clear label for each field or action. Do not repeat tab names as
  content headings or explain standard controls underneath them.
- Keep recording counts inside History; do not duplicate them in a tab badge.
- Omit helper paragraphs, slogans and duplicate status text when the control
  already explains itself. A placeholder may give a short example of valid
  input, such as `Example: World of Warcraft, night elf woman`; it must not
  substitute for a label or merely announce that text will appear there.
- Add help only for a concrete, non-obvious interaction. Prefer a short
  contextual hint or tooltip rather than permanent explanatory copy.
- Keep accessible names and tooltips for icon-only actions, operational
  errors, hotkey fallback warnings and irreversible-deletion confirmations.
- Usage costs must be labeled as estimates and reflect the displayed totals.
- Delay microphone-preparation copy for 400 ms so quick device startup does
  not flash unreadable text. Keep the actual preparation/recording guards
  immediate and show meaningful waiting states if preparation takes longer.
- Review copy in all five interface languages. Use native Mantine spacing;
  compactness must not compromise readable labels or usable controls.

Changes ship through a feature/fix branch and pull request. Require the
`CI / required` check (tests and full Windows build), then validate the preview
on Windows before squash merging UI/HUD changes. Keep unverified changes out
of `main`; publishing a stable release is a separate, explicit step.

The absolutely positioned editor main pane must use explicit Mantine
`p="md"` and `mih={0}`. AppShell otherwise adds header/footer offsets inside
its padding and a viewport minimum height. Shared HUD CSS loads before
editor/Mantine CSS in production, so a same-specificity CSS override that
works in Vite dev can silently lose in the bundle. Test the built renderer: a
single content inset under tabs, equal top/side/bottom padding, and main
bounds ending above the footer.

## Regression tests

- In the native Windows hook, `Ctrl+Shift+O` and `Ctrl+Shift+M` must
  fire repeatedly, not just once after application launch.
- Both shortcut key-up and modifier-key-up must rearm one-shot bindings.
- The CI Windows build must pass the native helper self-test and TypeScript.
- Confirm separately on a real Windows desktop: both window shapes, dark/light
  switch, all tabs, long history scrolling, overlay movement, and repeat hotkeys.

The owner has approved the resulting 1.0 editor, tray/HUD behavior and icon
after Windows/game testing. Preserve the native flags and production-layout
regressions when evolving that stable baseline. CI does not replace visual
checks on other Windows/GPU/display configurations.
