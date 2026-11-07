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

Electron is a frameless always-on-top window, not a browser tab. A little
custom behavior is necessary solely for:

1. OS-level dragging, click-through and keyboard capture;
2. native alpha transparency for smooth anti-aliased window corners;
3. clipping the editor to the rounded window boundary;
4. the 254×54 in-game HUD, which stays independent of Mantine for performance;
5. preventing text selection when dragging non-editable UI;
6. scrolling the central pane without moving the header/footer.

The product is **inspired by the density of Discord**, not a Discord theme,
clone, component library, brand, or collection of extracted assets.

## Compact UI copy

- Use one clear label for each field or action. Do not repeat tab names as
  content headings or explain standard controls underneath them.
- Omit instructional placeholders, helper paragraphs, slogans and duplicate
  status text when the control already explains itself.
- Add help only for a concrete, non-obvious interaction. Prefer a short
  contextual hint or tooltip rather than permanent explanatory copy.
- Keep accessible names and tooltips for icon-only actions, operational
  errors, hotkey fallback warnings and irreversible-deletion confirmations.
- Usage costs must be labeled as estimates and reflect the displayed totals.
- Review copy in all five interface languages. Use native Mantine spacing;
  compactness must not compromise readable labels or usable controls.

Changes ship through a feature/fix branch and pull request. Require the
`CI / required` check (tests and full Windows build), then validate the preview
on Windows before squash merging UI/HUD changes. Keep unverified changes out
of `main`; publishing a stable release is a separate, explicit step.

## Regression tests

- In the native Windows hook, `Ctrl+Shift+O` and `Ctrl+Shift+M` must
  fire repeatedly, not just once after application launch.
- Both shortcut key-up and modifier-key-up must rearm one-shot bindings.
- The CI Windows build must pass the native helper self-test and TypeScript.
- Confirm separately on a real Windows desktop: both window shapes, dark/light
  switch, all tabs, long history scrolling, overlay movement, and repeat hotkeys.

The current built v0.10.1 artifact has passed compilation and key-routing
tests; visual and overlay behavior still needs a live desktop review.
