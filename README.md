# Character.AI to CrushOn.AI Card Exporter

Chrome extension that exports your Character.AI bots as Tavern character cards — ready for one-click import into CrushOn.AI, SillyTavern, RisuAI, Chub.ai, or any other platform that accepts the Tavern character card spec.

Two export formats:

- **JSON** — Tavern V1 flat schema (`name`, `personality`, `scenario`, `description`, `mes_example`, `first_mes`)
- **PNG character card** — avatar PNG with the JSON embedded as a base64-encoded `tEXt` chunk (keyword `chara`), the de facto standard format across the Tavern ecosystem

## How it works

1. Open any `character.ai/chat/...` or `character.ai/character/...` page.
2. Two floating buttons appear top-right — pink **📥 Export JSON**, purple **🎴 Export PNG Card**.
3. Click one. The file downloads with the character's name.
4. On CrushOn.AI's [create-character page](https://crushon.ai/character/create), drop the file into the "Character Photo & File" area — CrushOn auto-populates the form.

## Field mapping (Character.AI → Tavern V1 → CrushOn)

Verified end-to-end against a real CrushOn import. Tavern V1's `personality` lands in CrushOn's **Introduction** (Brief Description, display only), and Tavern V1's `description` lands in **Personality** (detailed, long-term memory).

| Character.AI field | Tavern V1 | CrushOn form |
|---|---|---|
| `name` | `name` | Character's name |
| `title` (tagline, ≤50ch) | `personality` | **Introduction** |
| `description` (≤500ch; c.ai-generated "About" text) | `description` | **Personality** |
| `greeting` | `first_mes` | Greeting |
| `definition` (≤32K; only if creator set Definition Visibility = Public) | `mes_example` | Example Conversation |
| — | `scenario` | Scenario (user-filled) |
| `avatar_file_name` | — | Character Photo (embedded in PNG variant) |

Fields without a Character.AI equivalent (Gender, Age, Appearance, Tags) are left blank for manual fill.

## Install (developer mode, until Chrome Web Store approval)

1. Clone or download this repo.
2. Open `chrome://extensions/` → enable **Developer mode** (top right).
3. Click **Load unpacked** → select the project root folder.
4. Pin the extension icon.

## Known limits

- **`mes_example` empty?** It depends on the character's creator. Character.AI has two independent visibility flags — *Character Visibility* (who can chat) and *Definition Visibility* (whether the `definition` field is returned by the API). If the creator set Private Definition, the API returns `has_definition: true` but omits the field itself. Nothing the extension can do.
- **`description` empty?** For newer or less-popular characters c.ai hasn't auto-generated an "About" paragraph for, this field returns `""`. Use CrushOn's "AI Summarize" button to fill the Personality field after import.
- **No `gender` / `age` / `appearance` / `tags`** — Character.AI doesn't expose these in the API.
- **API may change again.** If extraction breaks, see [Troubleshooting](#troubleshooting).

## Privacy

This extension runs entirely in your browser. No data is sent to remote servers. The Authorization token is captured from the page and replayed against Character.AI's API only — same authentication path the website itself uses.

Full policy: [privacy.html](./privacy.html) (also served at <https://taquanta.github.io/character-ai-to-crushon-ai-card-exporter/privacy.html>)

## Ethics

Intended for users migrating their own characters or characters whose creators have made the definition public. No batch / bulk export — single character at a time, by user-initiated click.

## Troubleshooting

**No buttons appear**
- URL must include `/chat/` or `/character/`
- Reload the page after installing the extension

**"Could not extract character data" / empty export**
- Character.AI may have changed the API. Open DevTools → Network → filter by `character.ai` or `neo.character.ai` → search the response bodies (Cmd+F in the Network panel) for visible character text. The endpoint that returns the data is the one to port into `tryApiFetch()` in `content.js`.

**`mes_example` is empty even for a popular character**
- Creator set Definition Visibility = Private. This is intentional on Character.AI's side and not solvable by the extension.

**PNG avatar fails to load**
- The extension falls back to a colored gradient placeholder. The embedded character data is still correct.

## File layout

```
character-ai-to-crushon-ai-card-exporter/
├── manifest.json       Manifest V3 config
├── content.js          Main script — UI, extraction, conversion, PNG building
├── intercept.js        MAIN-world auth-token sniffer (page-context)
├── background.js       Legacy service-worker fetch proxy (unused; kept for compat)
├── popup.html          Extension popup
├── privacy.html        Privacy policy (served via GitHub Pages)
├── icons/              Extension icons (16/32/48/128) + generator
├── screenshots/        Chrome Web Store listing assets (1280×800)
├── package.sh          Build script — outputs dist/<name>-v<version>.zip
└── LICENSE             MIT
```

## Tavern character card reference

The PNG format embeds the character JSON as a `tEXt` chunk with keyword `chara`, value base64-encoded UTF-8 JSON. This is the standard format across SillyTavern, RisuAI, Chub.ai, Agnaistic, and CrushOn.AI.

Schema spec: <https://github.com/malfoyslastname/character-card-spec-v2>

## License

[MIT](./LICENSE)
