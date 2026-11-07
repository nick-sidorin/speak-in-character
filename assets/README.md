# Application artwork

- `app-icon.svg` is the editable vector source: a microphone in a speech bubble,
  using the same indigo/white palette as the tray icon.
- `app-icon.png` is its 512px transparent export for the native window (startup uses the SVG).
- `app-icon.ico` contains 16, 20, 24, 32, 40, 48, 64, 128 and 256px images for
  Windows executable/shortcut/Explorer use.
- `tray.png` retains the original small microphone drawing, tuned for tray size.

Export the SVG on a transparent background, then create the multi-resolution
ICO from that export. These are versioned application assets; packaging uses
the checked-in files and does not require an image tool or extra dependency.
