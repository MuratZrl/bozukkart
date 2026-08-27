# Fonts for the link-preview images

`next/font` downloads these same two faces for the app itself, but it only ever
emits woff2 and satori — what `next/og` renders the Open Graph images with —
cannot read woff2. So they are vendored here as TrueType, read once at module
scope in `src/lib/og.tsx`, and traced into the image routes at build time.

| File                 | Face          | Source                                                                          |
| -------------------- | ------------- | ------------------------------------------------------------------------------- |
| `Anton-Regular.ttf`  | Anton 400     | `https://fonts.gstatic.com/s/anton/v27/1Ptgg87LROyAm0K0.ttf`                     |
| `Inter-Regular.ttf`  | Inter 400     | `https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf` |

Both are licensed under the SIL Open Font License 1.1; the licences are beside
them as `Anton-OFL.txt` and `Inter-OFL.txt` and must stay bundled with the files.

If the app ever changes face, change it here too — the preview image is supposed
to look like the game.
