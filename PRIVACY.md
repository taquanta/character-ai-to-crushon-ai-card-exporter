# Privacy Policy — Character Card Exporter for CrushOn

_Last updated: 2026-05-15_

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

- The Extension does **not** transmit any of your data to any server controlled by the Extension's author. There is no backend, no analytics endpoint, no telemetry, no error reporting service.
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
| `activeTab` | To inject the export buttons into the Character.AI page you are currently viewing. |
| `scripting` | To run the export logic (data extraction + file building) in the page context. |
| `host_permissions` for Character.AI domains | To read character data from Character.AI's API and fetch avatar images for embedding in PNG cards. |

## 5. Third parties

The Extension communicates only with Character.AI servers (the domains listed in §1). It does not communicate with any other third party.

When you upload the exported file to CrushOn.AI (or SillyTavern, RisuAI, Chub.ai, etc.), that platform's privacy policy governs how they handle the file. The Extension has no involvement in that step.

## 6. Children

The Extension is not directed at children under 13. Character.AI's own terms restrict use accordingly.

## 7. Changes to this policy

If the Extension changes what data it reads or where it sends data, this document will be updated and a new "Last updated" date set. Material changes will be noted in the Chrome Web Store listing changelog.

## 8. Contact

For questions about this policy or the Extension's behavior, open an issue at the project's source repository (linked from the Chrome Web Store listing).
