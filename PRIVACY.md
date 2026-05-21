# Privacy Policy — Character Card Exporter for CrushOn

_Last updated: 2026-05-21_

This Chrome extension ("the Extension") helps you export your own characters from Character.AI as portable Tavern character card files (JSON or PNG). This document describes exactly what data the Extension touches and what it does with it.

## 1. What the Extension reads

The Extension runs only on the following domains:

- `character.ai`
- `beta.character.ai`
- `plus.character.ai`
- `neo.character.ai`
- `characterai.io`

When you visit one of those pages, the Extension reads:

- **The page URL** — to detect which character you are viewing.
- **The `Authorization: Token …` HTTP header** that Character.AI's own client attaches to its API requests. The Extension captures this from within your active browser session (via a page-context fetch/XHR hook) and replays it on subsequent requests to Character.AI's API. This is the same authentication mechanism Character.AI's own website uses; the Extension does not generate, decode, or transmit the token anywhere else.
- **Character data returned by Character.AI's API** in response to those requests — character name, tagline (title), description, greeting, definition (if creator has made it public), and avatar URL.
- **Avatar image bytes** — fetched from `characterai.io` to embed in the PNG character card export.

## 2. What the Extension does NOT do

- The Extension does **not** transmit your characters, conversations, or any Character.AI personal data to any external server. The only data sent externally is anonymous usage telemetry described in §6.
- The Extension does **not** collect personally identifiable information such as your name, email address, location, or general browsing history.
- The Extension does **not** read your Character.AI password or cookies (the captured `Authorization` token is the bearer token Character.AI's client uses, not a cookie or password).
- The Extension does **not** read data from any website other than the Character.AI domains listed above.
- The Extension does **not** modify Character.AI's content or send messages on your behalf.
- The Extension does **not** persist the captured `Authorization` token across page reloads — it lives only in a `<meta>` tag on the current page and is discarded when you close or navigate away from the tab.

## 3. Where exported data goes

- Exported `.json` and `.png` files are saved to **your local Downloads folder** via the browser's standard download mechanism. No copies are sent elsewhere.
- It is your responsibility to handle these files appropriately — they may contain character definitions written by you or, if the creator chose to make them public, by other Character.AI users.

## 4. Permissions justification

| Permission | Why it's required |
|---|---|
| `host_permissions` for Character.AI domains | To read character data from Character.AI's API and fetch avatar images for embedding in PNG cards. |

## 5. Third parties

The Extension communicates with the following external services only:

- **Character.AI servers** (the domains listed in §1) — to read character data and fetch avatar images, on demand when you click an export button.
- **Google Analytics 4** (`google-analytics.com`) — to send anonymous usage telemetry described in §6.

No other third party is contacted from within the browser session.

When you subsequently upload an exported file to CrushOn.AI (or SillyTavern, RisuAI, Chub.ai, etc.), that platform's privacy policy governs how they handle the file. The Extension has no involvement in that step.

## 6. Analytics and usage telemetry

The Extension uses **Google Analytics 4** (via the Measurement Protocol API) to collect anonymous usage statistics that help us understand how the Extension is being used and improve it.

### What is collected

- **Event names**: a small fixed set of events such as `extension_installed`, `extension_updated`, `popup_opened`, `export_json`, `export_png`, and `export_failed`.
- **Event parameters**: the Extension version number, and for export events the source domain (e.g. `character.ai` vs `beta.character.ai`) and, on failure, a short error category such as `api_error` or `extraction_error`.
- **A randomly generated client identifier** — a UUID stored locally in your browser via `chrome.storage.local`. This lets us count unique installs without identifying you personally. It is not linked to any account, email, or device fingerprint.
- **Coarse technical metadata automatically attached by Google Analytics**: approximate country (derived from IP address, which Google itself truncates before storage), browser language, and timestamp.

### What is NOT collected

- Character names, descriptions, definitions, greetings, or any content of the characters you export.
- Your Character.AI account credentials, authorization token, cookies, or session data.
- The URLs of the pages you visit on Character.AI.
- Your full IP address (Google truncates the last octet before storage), email, real-world identity, or any other personal identifier.

### How to opt out

You can disable analytics at any time by opening the Extension popup (click the Extension icon in your browser toolbar) and toggling off the "Help improve this extension (anonymous usage data)" switch. Once disabled, the Extension will not send any analytics events until you re-enable it. Uninstalling the Extension also stops all data collection.

### Data retention

Analytics data is retained by Google Analytics for the default retention period (14 months) and is then automatically deleted.

## 7. Children

The Extension is not directed at children under 13. Character.AI's own terms restrict use accordingly.

## 8. Changes to this policy

If the Extension changes what data it reads or where it sends data, this document will be updated and a new "Last updated" date set. Material changes will be noted in the Chrome Web Store listing changelog.

## 9. Contact

For questions about this policy or the Extension's behavior, open an issue at the project's source repository (linked from the Chrome Web Store listing).
