# Application artwork

- `app-icon-source.png` is the 1254px RGB artwork with the owner-requested square background:
  a white microphone inside a slender elven face, sharp ears with curved lobes,
  and a softly pointed chin on a blue tile. The capsule sits lower so the gap
  to its cradle is balanced at the sides and bottom. Keep this approved
  symbol composition and bold strokes; do not substitute an earlier review variant.
- `app-icon.png` is the 512px RGB export for the native editor and startup screen.
- `app-icon.ico` contains 16, 20, 24, 32, 40, 48, 64, 128 and 256px images for
  Windows executable/shortcut/Explorer and native editor use. On Windows,
  pass the ICO itself to BrowserWindow so Electron loads the small/large
  HICON at the system metric sizes; PNG remains for startup and other OSes.
- `tray.png` retains the existing small microphone drawing, as requested.

The master has a full square opaque blue background: no rounded tile corners,
black corner pixels or alpha channel. Preserve that background.
The art is a raster with a vector-like appearance, not an editable SVG. The
retired speech-bubble SVG is removed so it cannot appear during startup.

To export the approved master locally with ImageMagick:

```sh
magick assets/app-icon-source.png -resize 512x512 -strip PNG24:assets/app-icon.png
magick assets/app-icon-source.png -define icon:auto-resize=256,128,64,48,40,32,24,20,16 assets/app-icon.ico
```

These are versioned application assets. Packaging uses the checked-in files
and does not require ImageMagick or any new application/build dependency.
