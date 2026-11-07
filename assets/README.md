# Application artwork

- `app-icon-source.png` is the original 1254px RGB artwork approved by the owner:
  a white microphone inside a slender elven face, sharp ears with curved lobes,
  and a softly pointed chin on a blue tile. The capsule sits lower so the gap
  to its cradle is balanced at the sides and bottom. Keep this exact approved
  composition and bold strokes; do not substitute an earlier review variant.
- `app-icon.png` is the 512px RGB export for the native editor and startup screen.
- `app-icon.ico` contains 16, 20, 24, 32, 40, 48, 64, 128 and 256px images for
  Windows executable/shortcut/Explorer use.
- `tray.png` retains the existing small microphone drawing, as requested.

The approved master has no alpha channel; preserve its opaque background.
The art is a raster with a vector-like appearance, not an editable SVG. The
retired speech-bubble SVG is removed so it cannot appear during startup.

To export the approved master locally with ImageMagick:

```sh
magick assets/app-icon-source.png -resize 512x512 -strip PNG24:assets/app-icon.png
magick assets/app-icon.png -define icon:auto-resize=256,128,64,48,40,32,24,20,16 assets/app-icon.ico
```

These are versioned application assets. Packaging uses the checked-in files
and does not require ImageMagick or any new application/build dependency.
