# SpeakInCharacter — interface direction (v0.9)

**Chosen design:** a custom Discord-inspired **Ash** interface, built with Mantine React components for the main editor and a tiny custom Electron HUD for in-game status. Inspiration only: no Discord logos, assets, source, or implication of endorsement.

## Why Mantine

- Compatible with React + TypeScript + Vite/Electron.
- Dark mode and theme tokens supported natively, plus a set of polished form controls.
- Build the main panel around Mantine Tabs, Textarea, Select, Button, ActionIcon, Tooltip, Badge and ScrollArea.
- Keep the Windows click-through overlay as small, hand-authored HTML/CSS; it should **not** load a big app-shell UI.
- Keep existing Lucide icon assets instead of introducing another icon family.
- Prefer incremental migration instead of replacing the working audio/keyboard/API logic.

References:
- Mantine component examples: https://ui.mantine.dev/
- Mantine theme and dark mode: https://mantine.dev/theming/color-schemes/
- Discord's desktop Ash/Dark/Onyx themes: https://discord.com/blog/improving-mobile-with-squircles-styles-and-spacing
- Alternative custom-component system: https://ui.shadcn.com/docs/installation/vite

## Appearance: Ash-like, not Discord branding

| Semantic token | Starting value | Use |
| --- | --- | --- |
| `surface-base` | `#1b1d22` | Main editor background |
| `surface-raised` | `#262830` | Inputs and compact fields |
| `surface-overlay` | `#2d3038` | Dropdowns and menus |
| `border` | `#3b3e49` | Subtle dividers |
| `text-primary` | `#f3f4f8` | Input and output |
| `text-muted` | `#a7acb8` | Context hints |
| `accent` | `#7686ed` | Primary copy action and focus |
| `record` | `#f06d71` | Mic activity / destructive |
| `success` | `#49bc91` | Finished draft |

Use Segoe UI, Inter (system fallback), normal letter spacing and short labels. Avoid thick borders, giant hero headings, glass effects in the editor, and large forms.

## Panel layout (~520 × 705 px)

1. Slim draggable header: **SpeakInCharacter**, small status pill, close button.
2. Compact tabs: **Reply**, **History**, **Settings**.
3. On Reply: language and speech preset in one row or compact two-row grid.
4. Optional **Additional context** expandable text area, retaining draft.
5. Recording card: one prominent record/status button; red while held, spinner while waiting, green check when copied.
6. Transcript (editable, low-emphasis) and ready-to-send reply (editable, high-emphasis).
7. One clear primary action: **Copy to clipboard**; secondary **Rewrite**.
8. History: lightweight list with duration, preview, play, save audio.
9. Settings: language (System / manual), API, shortcut assignment, presets folder, microphone, cost.

The primary screen must fit without scrolling on typical 1080p. Where necessary, scroll only editor content; keep the primary action within reach.

## HUD

Keep the custom ~254×54 px window. Two lines, compact status dot, low-opacity background and click-through by default. Its layout is independent from Mantine so game overlay is stable.

## Implementation (v0.9)

Mantine core + hooks, app theme, light/dark/system preference and UI components are now being integrated. The tiny HUD stays independent from the large panel.

## Next implementation pass

- Add `@mantine/core` and `@mantine/hooks`; theme only the main panel.
- Introduce `src/theme.ts` with named tokens and component defaults.
- Migrate controls in small, reversible commits.
- Verify main panel and HUD window geometry separately.
- Build a Windows preview after review; do not auto-publish releases.
