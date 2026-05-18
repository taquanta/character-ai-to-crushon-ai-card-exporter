# Icons

Place the following PNG files here before publishing:

- `icon16.png` — 16×16 — toolbar icon
- `icon32.png` — 32×32 — Windows fallback
- `icon48.png` — 48×48 — extension management page
- `icon128.png` — 128×128 — Chrome Web Store listing + install dialog

## Design suggestions

- **Single recognizable mark.** A character card silhouette, a portrait-in-frame, or a stylized download/migration arrow. Avoid text — at 16px nothing reads.
- **Theme color**: the extension UI uses pink `#ec4899` (JSON button) and purple `#a855f7` (PNG button). A gradient between them on white reads well.
- **Padding**: leave 10–15% margin inside each icon so it doesn't crowd the toolbar slot.
- **Background**: transparent PNG for 16/32/48; for 128 (store listing) a solid or gradient background looks more polished.

## Quick way to make them

1. Design once at 1024×1024 in Figma / Photoshop / Affinity.
2. Export at the 4 sizes above as PNG-24 with transparency.

## Don't ship without these

The Chrome Web Store rejects extensions whose `manifest.json` references missing icon files. If you publish before adding them, remove the `icons` and `default_icon` entries from `manifest.json` first — but the Store listing still requires a 128×128 upload separately.
