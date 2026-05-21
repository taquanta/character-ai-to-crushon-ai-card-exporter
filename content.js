// CrushOn Character Importer — content script (v0.3)
// Two export modes on Character.AI character pages:
//   1) JSON file  — Tavern V1 flat schema (6 fields), downloads .json
//   2) PNG card   — avatar PNG with embedded Tavern V1 JSON in tEXt chunk (keyword: "chara")
// Schema verified by inspecting a CAI Tools export that successfully uploaded to CrushOn.AI:
//   { name, personality, scenario, description, mes_example, first_mes }

(() => {
  'use strict';

  const CONTAINER_ID = 'crushon-export-container';

  // ============================================================
  //  URL / character-id detection
  // ============================================================

  function getCharacterIdFromUrl() {
    const path = location.pathname;
    let m = path.match(/\/chat\/([a-zA-Z0-9_-]{8,})/);
    if (m) return m[1];
    const url = new URL(location.href);
    const queryId = url.searchParams.get('id') || url.searchParams.get('char');
    if (queryId) return queryId;
    m = path.match(/\/character\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return null;
  }

  function isCharacterPage() {
    const p = location.pathname;
    return p.includes('/chat/') || p.includes('/character/');
  }

  // ============================================================
  //  Fetch character data (API → SSR → DOM fallback chain)
  // ============================================================

  // Read the auth token captured by intercept.js (page-world hook). C.AI's
  // client uses "Authorization: Token <hex>" on every authenticated request;
  // intercept.js sniffs that header and stashes the latest value in a meta
  // tag for us.
  function getAuthToken() {
    const meta = document.querySelector('meta[cai_token]');
    return meta ? meta.getAttribute('cai_token') : null;
  }

  // intercept.js captures the token from the first auth'd request C.AI makes.
  // On a fresh page load the export button can be clicked before that
  // happens; poll briefly so the API path doesn't fail spuriously.
  function waitForAuthToken(timeoutMs = 1500, pollMs = 50) {
    return new Promise(resolve => {
      const start = Date.now();
      const tick = () => {
        const t = getAuthToken();
        if (t) return resolve(t);
        if (Date.now() - start > timeoutMs) return resolve(null);
        setTimeout(tick, pollMs);
      };
      tick();
    });
  }

  // Fetch from content-script context. Content scripts inherit the host
  // page's origin for fetch (character.ai → plus.character.ai is allowed
  // by C.AI's CORS), unlike background-worker fetches which originate from
  // chrome-extension:// and get rejected at the edge.
  //
  // IMPORTANT: do NOT pass `credentials: 'include'`. C.AI's preflight does
  // not return `Access-Control-Allow-Credentials: true`, so the browser
  // hard-blocks any credentialed cross-origin request. The captured Bearer
  // token in the Authorization header is the only auth we need; cookies are
  // unnecessary. CAI Tools uses the same default-credentials approach.
  async function pageFetch(url, method, body, token) {
    const headers = { 'Accept': 'application/json' };
    if (body != null) headers['Content-Type'] = 'application/json';
    if (token) headers['authorization'] = token;
    try {
      const res = await fetch(url, {
        method: method || 'GET',
        headers,
        body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      });
      let data = null, text = null;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('json')) {
        try { data = await res.json(); } catch (_) { try { text = await res.text(); } catch (_) {} }
      } else {
        try { text = await res.text(); } catch (_) {}
        if (text) { try { data = JSON.parse(text); text = null; } catch (_) {} }
      }
      return { ok: res.ok, status: res.status, statusText: res.statusText, data, text };
    } catch (e) {
      return { ok: false, status: 0, error: String(e?.message || e) };
    }
  }

  // Legacy background-worker proxy. Kept for reference / future fallback —
  // currently unused because page-context fetch with a captured token is
  // strictly better. background.js still listens for the message type.
  function bgFetch(url, method, body) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          {
            type: 'cai-fetch',
            url,
            method,
            body,
            headers: body
              ? { 'Content-Type': 'application/json', 'Accept': 'application/json' }
              : { 'Accept': 'application/json' },
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              resolve({ ok: false, status: 0, error: chrome.runtime.lastError.message });
              return;
            }
            resolve(resp || { ok: false, status: 0, error: 'no response' });
          }
        );
      } catch (e) {
        resolve({ ok: false, status: 0, error: String(e) });
      }
    });
  }
  void bgFetch; // suppress unused warning; intentionally retained

  async function tryApiFetch(externalId) {
    let token = getAuthToken();
    if (!token) {
      console.log('[CrushOn Importer] Token not yet captured; polling intercept.js for up to 1.5s…');
      token = await waitForAuthToken();
    }
    if (!token) {
      console.warn('[CrushOn Importer] No Authorization token captured. If you just installed the extension, refresh the page once. If the page makes no auth requests (e.g. logged out), API path is unreachable — will fall back to SSR.');
    }

    // Endpoint priority (as of 2026-05-15, verified against C.AI's own page):
    // 1. neo /character/v1/get_character_info is the canonical endpoint —
    //    returns full {name, title, description, greeting, avatar, definition?,
    //    short_hash, ...} for any visible character, owned or not. CAI moved
    //    here from plus.character.ai/chat/character/ which now 403s.
    // 2. Old plus.character.ai endpoints kept as fallbacks in case neo is
    //    rate-limited or rolled back.
    const candidates = [
      ['https://neo.character.ai/character/v1/get_character_info', 'POST', { external_id: externalId, lang: 'en' }],
      ['https://plus.character.ai/chat/character/', 'POST', { external_id: externalId }],
      ['https://plus.character.ai/chat/character/info/', 'POST', { external_id: externalId }],
    ];

    // Treat a response as a real hit only if it carries a populated character
    // object. C.AI's /chat/character/ returns `{character: {}, status: "do
    // not have permission to view this Character"}` for non-creators — the
    // empty {} is truthy in JS, so the previous check let it through and we
    // never tried the public /chat/character/info/ fallback. We must require
    // a non-empty character or a top-level name field.
    function hasUsefulPayload(data) {
      if (!data) return false;
      const c = data.character;
      if (c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length > 0) return true;
      if (data.name || data.external_id) return true;
      const trpc = data?.result?.data?.json || data?.result?.data;
      if (trpc && (trpc.character || trpc.name || trpc.external_id)) return true;
      return false;
    }

    const tried = [];
    for (const [url, method, body] of candidates) {
      // Retry once on transient failures (network error, 5xx) before moving
      // to the next candidate — fixes flaky exports where rate-limit blips
      // dropped us to SSR-only output.
      for (let attempt = 0; attempt < 2; attempt++) {
        const t0 = performance.now();
        const resp = await pageFetch(url, method, body, token);
        const ms = Math.round(performance.now() - t0);
        const note = resp.data?.status || (resp.data?.character && Object.keys(resp.data.character).length === 0 ? 'empty character {}' : undefined);
        tried.push({ url, method, attempt, status: resp.status, ms, error: resp.error, note });
        if (resp.ok && hasUsefulPayload(resp.data)) {
          console.log('[CrushOn Importer] API hit:', url, '→', resp.data);
          return resp.data?.result?.data?.json || resp.data?.result?.data || resp.data;
        }
        const transient = resp.status === 0 || (resp.status >= 500 && resp.status < 600);
        if (!transient || attempt > 0) break;
        console.log(`[CrushOn Importer] transient failure on ${url} (status=${resp.status}), retrying in 400ms…`);
        await new Promise(r => setTimeout(r, 400));
      }
    }
    console.warn('[CrushOn Importer] All API endpoints failed (page+token). Tried:', tried);
    console.warn('[CrushOn Importer] Token captured:', token ? `${token.slice(0, 16)}…` : '(none)');
    return null;
  }

  // ============================================================
  //  Strategy: extract character JSON from page's embedded SSR data
  //  C.AI uses Next.js — the character object is hydrated into the HTML
  //  via either <script id="__NEXT_DATA__"> (Pages router) or inline
  //  <script>self.__next_f.push(...)</script> chunks (App router).
  //  Walking those scripts and reconstructing the JSON object that
  //  contains the character's external_id is the most reliable path
  //  when there's no fetchable JSON API.
  // ============================================================

  // Match a C.AI character object against a URL identifier. The URL can carry
  // any of three identifiers, and the SSR object usually carries all three —
  // so any single-field match against the URL-provided id is sufficient AND
  // safe (each id form is globally unique on C.AI).
  //   external_id : 44-char full id (e.g. BNUb_UYj1H_xr1fjg...)
  //   short_hash  : 8-char route id  (e.g. JB6PBx_z)
  //   identifier  : "id:<uuid>"      (e.g. id:50e2f98e-8255-4b01-...)
  function idMatchesUrl(obj, urlId) {
    if (!urlId) return false;
    if (obj.external_id === urlId) return true;
    if (obj.character_id === urlId) return true;
    if (obj.id === urlId) return true;
    if (obj.short_hash === urlId) return true;
    if (obj.identifier === urlId) return true;
    // identifier is usually "id:<uuid>" while URL may carry the bare uuid
    if (typeof obj.identifier === 'string' && obj.identifier === `id:${urlId}`) return true;
    return false;
  }

  function findCharacterInObject(obj, charId, depth = 0) {
    if (depth > 12 || !obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const f = findCharacterInObject(item, charId, depth + 1);
        if (f) return f;
      }
      return null;
    }
    // Treat as character if URL id matches one of its id-fields AND it has
    // at least one substantive content field. The id-match check prevents
    // grabbing a same-named character from the sidebar / recommendations.
    if (idMatchesUrl(obj, charId) && (obj.name || obj.title || obj.greeting || obj.description || obj.definition)) {
      return obj;
    }
    for (const key of Object.keys(obj)) {
      const f = findCharacterInObject(obj[key], charId, depth + 1);
      if (f) return f;
    }
    return null;
  }

  // Find substrings in `text` that look like JSON objects and contain `needle`.
  // Returns parsed JS objects (best-effort).
  function extractJsonObjectsContaining(text, needle) {
    const out = [];
    let cursor = 0;
    while (cursor < text.length) {
      const idx = text.indexOf(needle, cursor);
      if (idx === -1) break;
      // walk left to find enclosing '{'
      let start = idx, depth = 0;
      for (let i = idx; i >= 0; i--) {
        const c = text[i];
        if (c === '}') depth++;
        else if (c === '{') {
          if (depth === 0) { start = i; break; }
          depth--;
        }
      }
      // walk right to matching '}'
      let end = idx, depth2 = 0, inStr = false, escape = false;
      for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (c === '"') inStr = !inStr;
        if (inStr) continue;
        if (c === '{') depth2++;
        else if (c === '}') {
          depth2--;
          if (depth2 === 0) { end = i + 1; break; }
        }
      }
      if (end > start) {
        try { out.push(JSON.parse(text.slice(start, end))); } catch (_e) {}
        cursor = end;
      } else {
        cursor = idx + needle.length;
      }
      if (out.length > 50) break; // safety
    }
    return out;
  }

  function trySsrExtraction() {
    const charId = getCharacterIdFromUrl();
    if (!charId) return null;

    // A) <script id="__NEXT_DATA__"> (Pages router / older SSR)
    const nextDataEl = document.querySelector('script#__NEXT_DATA__');
    if (nextDataEl?.textContent) {
      try {
        const data = JSON.parse(nextDataEl.textContent);
        const char = findCharacterInObject(data, charId);
        if (char) {
          console.log('[CrushOn Importer] SSR hit: __NEXT_DATA__ →', char);
          return { character: char };
        }
      } catch (_e) {}
    }

    // B) Inline scripts (App router pushes JSON-encoded chunks into self.__next_f)
    const scripts = document.querySelectorAll('script:not([src])');
    let scanned = 0;
    for (const s of scripts) {
      const text = s.textContent;
      if (!text || !text.includes(charId)) continue;
      scanned++;
      const objects = extractJsonObjectsContaining(text, `"${charId}"`);
      for (const obj of objects) {
        const char = findCharacterInObject(obj, charId);
        if (char) {
          console.log('[CrushOn Importer] SSR hit: inline script scan →', char);
          return { character: char };
        }
      }
    }
    if (scanned > 0) {
      console.warn(`[CrushOn Importer] SSR scan: scanned ${scanned} inline scripts containing charId, none yielded a character object.`);
    } else {
      console.warn('[CrushOn Importer] SSR scan: no inline scripts contain the character ID.');
    }
    return null;
  }

  // Heavily-filtered DOM scraping — the previous implementation grabbed
  // cookie banners / privacy notices as character names. Now we filter those
  // patterns explicitly and prefer document.title (most reliable for the name).
  const NON_CHARACTER_PATTERNS = /\b(opt[\s-]?out|cookie|privacy|consent|advertising|terms|policy|sign[\s-]?in|log[\s-]?in|sign[\s-]?up|continue with|accept|reject|manage preferences|gdpr|ccpa)\b/i;

  function cleanText(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function nameFromTitle() {
    let t = (document.title || '').trim();
    if (!t) return '';
    // Strip trailing platform suffix: " - character.ai", " | c.ai", etc.
    t = t.replace(/\s*[-|·–]\s*(c\.?ai|character\.?ai).*$/i, '').trim();
    // Strip leading "Chat with " (C.AI's title prefix on /chat/ pages),
    // also handle the C.AI mobile title "Talk to <name>" and the localized variants.
    t = t.replace(/^(chat\s+with|talk(?:ing)?\s+to|chatting\s+with|聊天与|与\s*|和\s*)\s+/i, '').trim();
    if (t && t.length < 100 && !/character\.?ai/i.test(t) && !NON_CHARACTER_PATTERNS.test(t)) {
      return t;
    }
    return '';
  }

  function firstMatchingText(selectors, { maxLen = 120, mustExclude = NON_CHARACTER_PATTERNS } = {}) {
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const txt = cleanText(el.textContent);
        if (!txt) continue;
        if (txt.length > maxLen) continue;
        if (mustExclude && mustExclude.test(txt)) continue;
        return txt;
      }
    }
    return '';
  }

  // Find a header element whose text contains the given substring (case-insensitive).
  function findHeaderContaining(substr) {
    const target = substr.toLowerCase();
    const headers = document.querySelectorAll('h1, h2, h3, h4, h5');
    for (const h of headers) {
      const t = cleanText(h.textContent).toLowerCase();
      if (t.includes(target)) return h;
    }
    return null;
  }

  // Walk forward (siblings, then parent's siblings) to find the next element
  // with substantive text content. Skips empty / nav / privacy text.
  function nextSubstantiveText(el, { minLen = 30, maxLen = 4000 } = {}) {
    function scan(node) {
      let n = node?.nextElementSibling;
      while (n) {
        const txt = cleanText(n.textContent);
        if (txt && txt.length >= minLen && txt.length <= maxLen && !NON_CHARACTER_PATTERNS.test(txt)) {
          return txt;
        }
        // also peek inside child paragraphs/divs
        const inner = n.querySelector('p, div');
        if (inner) {
          const itxt = cleanText(inner.textContent);
          if (itxt && itxt.length >= minLen && itxt.length <= maxLen && !NON_CHARACTER_PATTERNS.test(itxt)) {
            return itxt;
          }
        }
        n = n.nextElementSibling;
      }
      return null;
    }
    let found = scan(el);
    if (found) return found;
    // try parent's siblings
    const parent = el.parentElement;
    if (parent) found = scan(parent);
    return found || null;
  }

  function tryDomScrape() {
    const out = {};

    // --- name (most reliable: page <title>, then filtered DOM) ---
    out.name = nameFromTitle();
    if (!out.name) {
      out.name = firstMatchingText([
        '[data-testid*="char-name"]',
        '[class*="characterName"]',
        '[class*="character-name"]',
        'header h1', 'header h2',
        'main h1', 'main h2',
      ]);
    }
    if (!out.name) {
      out.name = firstMatchingText(['h1', 'h2'], { maxLen: 80 });
    }

    // --- description (profile page has "About <Character>" section) ---
    // 1) Best signal: header text that includes "About <name>" → next paragraph.
    if (out.name) {
      const header = findHeaderContaining(`about ${out.name.toLowerCase()}`);
      if (header) {
        const txt = nextSubstantiveText(header);
        if (txt) out.description = txt;
      }
      // 2) Some profiles also have "<name>'s Area of Expertise" / "<name>'s ..." sections
      //    — collect a couple more paragraphs to enrich the description.
      const extraHeaders = [];
      document.querySelectorAll('h2, h3, h4').forEach(h => {
        const t = cleanText(h.textContent);
        // headers like "Katsuki Bakugo's ...", "I geek out on...", "Personality", etc.
        if (
          t &&
          t.length < 100 &&
          (t.toLowerCase().startsWith(out.name.toLowerCase() + "'s") ||
            /^(personality|background|story|backstory|appearance|traits|likes|dislikes|interests|i (am|geek|love|hate))/i.test(t))
        ) {
          extraHeaders.push(h);
        }
      });
      const extras = [];
      for (const h of extraHeaders.slice(0, 4)) {
        const headerText = cleanText(h.textContent);
        const body = nextSubstantiveText(h, { minLen: 20 });
        if (body) extras.push(`${headerText}: ${body}`);
      }
      if (extras.length) {
        out.description = [out.description, extras.join('\n\n')].filter(Boolean).join('\n\n');
      }
    }
    // 3) Fallback: generic class-based selectors
    if (!out.description) {
      const desc = firstMatchingText(
        ['[class*="description"]', '[class*="bio"]', 'main [class*="about"]'],
        { maxLen: 4000 }
      );
      if (desc) out.description = desc;
    }

    // --- tagline / title ---
    // C.AI profile page sometimes shows a short tagline under the name,
    // before the "By @username" line. Heuristic: short text between name H1
    // and the "By @..." element.
    const taglineCand = firstMatchingText(
      ['[class*="tagline"]', '[class*="subtitle"]'],
      { maxLen: 200 }
    );
    if (taglineCand && taglineCand !== out.name) out.title = taglineCand;

    // --- greeting (only on chat page; profile page usually doesn't show it) ---
    const bubbles = document.querySelectorAll(
      '[class*="messageContent"], [class*="message-content"], [class*="chatMessage"], [class*="bubble"], [data-testid*="message"]'
    );
    for (const b of bubbles) {
      const t = cleanText(b.textContent);
      if (!t || t.length < 20 || t.length > 4000) continue;
      if (NON_CHARACTER_PATTERNS.test(t)) continue;
      out.greeting = t;
      break;
    }

    // --- avatar ---
    const imgEl = document.querySelector(
      'img[src*="characterai.io"], img[src*="character.ai/i/"], header img, main img[alt*="avatar" i]'
    );
    if (imgEl && imgEl.src) out.avatar_url = imgEl.src;

    return out;
  }

  // ============================================================
  //  Map to Tavern V1 flat schema (the format CAI Tools uses
  //  and CrushOn.AI accepts on its import upload)
  // ============================================================

  function pickAvatarUrl(c) {
    if (c.avatar_url) return c.avatar_url;
    if (c.avatar_file_name) return `https://characterai.io/i/400/static/avatars/${c.avatar_file_name}`;
    return null;
  }

  // Schema: 6 flat fields, no wrapper. Tavern V1 / TavernAI legacy format —
  // matches what CrushOn.AI's "import existing character" upload expects.
  //
  // C.AI field → Tavern V1 field → CrushOn form field mapping
  // (verified against a CrushOn import of a CAI-Tools export):
  //   C.AI name        → V1 name         → CrushOn "Character's name"
  //   C.AI title       → V1 personality  → CrushOn "Personality"  (short tagline, ≤50ch)
  //   C.AI description → V1 description  → CrushOn "Introduction" (public, ≤500ch)
  //   C.AI definition  → V1 mes_example  → CrushOn "Example Conversation" (private ≤32K, only for own chars)
  //   C.AI greeting    → V1 first_mes    → CrushOn "Greeting"
  //   (no C.AI equiv)  → V1 scenario     → CrushOn "Scenario"     (empty, user-filled)
  function toCharacterCard(raw) {
    const c = raw?.character || raw || {};

    // Name with <title> fallback (more reliable than DOM h1/h2)
    let name = (c.name || '').trim();
    if (!name) {
      const t = (document.title || '').replace(/\s*[-|·–]\s*(c\.?ai|character\.ai).*$/i, '').trim();
      if (t && t.length < 100 && !/character\.?ai/i.test(t)) name = t;
    }

    return {
      name,
      personality: (c.title || c.tagline || '').trim(),
      scenario: '',
      description: (c.description || '').trim(),
      mes_example: (c.definition || '').trim(),
      first_mes: (c.greeting || '').trim(),
    };
  }

  // Keep avatar URL on the side so the PNG builder can fetch it,
  // even though the embedded JSON itself is flat.
  function pickAvatarFromRaw(raw) {
    const c = raw?.character || raw || {};
    return pickAvatarUrl(c);
  }

  // ============================================================
  //  CRC32  (for PNG chunks)
  // ============================================================

  let _crcTable;
  function _initCrcTable() {
    _crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      _crcTable[n] = c >>> 0;
    }
  }
  function crc32(bytes) {
    if (!_crcTable) _initCrcTable();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = (_crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ============================================================
  //  PNG manipulation
  // ============================================================

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function buildTextChunk(keyword, text) {
    // tEXt chunk: 4B length + 4B "tEXt" + (keyword + 0x00 + text) + 4B CRC32
    const kw = new TextEncoder().encode(keyword);
    const tx = new TextEncoder().encode(text);
    const data = new Uint8Array(kw.length + 1 + tx.length);
    data.set(kw, 0);
    data[kw.length] = 0;
    data.set(tx, kw.length + 1);

    const type = new TextEncoder().encode('tEXt');
    const crcInput = new Uint8Array(type.length + data.length);
    crcInput.set(type, 0);
    crcInput.set(data, type.length);

    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    new DataView(chunk.buffer).setUint32(0, data.length, false);
    chunk.set(type, 4);
    chunk.set(data, 8);
    new DataView(chunk.buffer).setUint32(8 + data.length, crc32(crcInput), false);
    return chunk;
  }

  function isPng(bytes) {
    return bytes.length > 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
      bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A;
  }

  function insertTextChunkAfterIhdr(pngBytes, textChunk) {
    // PNG: 8B signature + IHDR chunk (4B len = 13, 4B "IHDR", 13B data, 4B CRC) = 25B
    // We insert our tEXt chunk right after IHDR, before any IDAT.
    const IHDR_END = 8 + 25;
    if (pngBytes.length < IHDR_END) throw new Error('PNG too short / malformed');
    const out = new Uint8Array(pngBytes.length + textChunk.length);
    out.set(pngBytes.subarray(0, IHDR_END), 0);
    out.set(textChunk, IHDR_END);
    out.set(pngBytes.subarray(IHDR_END), IHDR_END + textChunk.length);
    return out;
  }

  // ============================================================
  //  Image fetching + format conversion
  // ============================================================

  async function fetchAvatarAsPng(url) {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`avatar fetch ${res.status}`);
    const blob = await res.blob();
    const buf = new Uint8Array(await blob.arrayBuffer());
    if (isPng(buf)) return buf;
    // Not PNG → convert via canvas
    return await convertImageBlobToPng(blob);
  }

  async function convertImageBlobToPng(blob) {
    const objUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = (e) => reject(e);
        i.src = objUrl;
      });
      const w = img.naturalWidth || 400;
      const h = img.naturalHeight || 400;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0);
      const pngBlob = await new Promise(r => cv.toBlob(r, 'image/png'));
      return new Uint8Array(await pngBlob.arrayBuffer());
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  }

  async function makePlaceholderPng(name) {
    const cv = document.createElement('canvas');
    cv.width = 400; cv.height = 400;
    const ctx = cv.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 400, 400);
    grad.addColorStop(0, '#ec4899');
    grad.addColorStop(1, '#a855f7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '200px -apple-system, "Segoe UI", sans-serif';
    const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
    ctx.fillText(initial, 200, 200);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }

  // ============================================================
  //  Build Tavern V1 (flat schema) PNG character card
  //  — same format CAI Tools produces and CrushOn.AI accepts.
  // ============================================================

  async function buildCharacterPng(card, avatarUrl) {
    let pngBytes;
    if (avatarUrl) {
      try {
        pngBytes = await fetchAvatarAsPng(avatarUrl);
      } catch (e) {
        console.warn('[CrushOn Importer] avatar fetch failed, using placeholder:', e);
        pngBytes = await makePlaceholderPng(card.name);
      }
    } else {
      pngBytes = await makePlaceholderPng(card.name);
    }
    // Match CAI Tools' tab-indented JSON for byte-level similarity.
    const jsonStr = JSON.stringify(card, null, '\t');
    const b64 = utf8ToBase64(jsonStr);
    const textChunk = buildTextChunk('chara', b64);
    return insertTextChunkAfterIhdr(pngBytes, textChunk);
  }

  // ============================================================
  //  Download helpers
  // ============================================================

  function safeFilename(s) {
    return (s || 'character').trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'character';
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }

  // ============================================================
  //  Toast
  // ============================================================

  function toast(msg, kind = 'ok') {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `
      position: fixed;
      top: 180px;
      right: 16px;
      z-index: 2147483647;
      background: ${kind === 'ok' ? '#16a34a' : '#dc2626'};
      color: white;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      max-width: 320px;
      line-height: 1.5;
    `;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  // ============================================================
  //  Get card (shared between JSON / PNG flows)
  // ============================================================

  async function getCard() {
    const charId = getCharacterIdFromUrl();
    console.log('[CrushOn Importer] character ID:', charId);
    if (!charId) {
      toast('No character ID found in URL. Open a character chat or profile page first.', 'err');
      return null;
    }
    let raw = await tryApiFetch(charId);
    let source = 'api';
    if (!raw) {
      console.warn('[CrushOn Importer] API failed → trying SSR data extraction');
      raw = trySsrExtraction();
      source = 'ssr';
    }
    // C.AI's new URL scheme uses an 8-char short code; the API rejects it
    // (400/403). SSR exposes the canonical external_id — if it differs from
    // the URL form, retry the API to upgrade SSR's preview payload into a
    // full character object with greeting / description / definition.
    if (raw?.character?.external_id && raw.character.external_id !== charId) {
      const longId = raw.character.external_id;
      console.log('[CrushOn Importer] SSR exposed long external_id, retrying API:', longId);
      const upgraded = await tryApiFetch(longId);
      if (upgraded) {
        raw = upgraded;
        source = 'api-via-ssr';
      }
    }
    if (!raw) {
      console.warn('[CrushOn Importer] SSR failed → falling back to DOM scrape');
      raw = tryDomScrape();
      source = 'dom';
      console.log('[CrushOn Importer] DOM scrape result:', raw);
    }
    if (!raw || (!raw.character && !raw.name)) {
      toast('Could not extract character data. Maybe re-login on Character.AI?', 'err');
      return null;
    }
    const card = toCharacterCard(raw);
    const avatarUrl = pickAvatarFromRaw(raw);
    // Report which fields ended up populated — helps diagnose "fields empty in CrushOn"
    const filled = Object.entries(card)
      .filter(([k, v]) => v && (typeof v === 'string' ? v.trim() : true))
      .map(([k]) => k);
    console.log(`[CrushOn Importer] card built (source: ${source}). Filled fields: ${filled.join(', ')}`);
    console.log('[CrushOn Importer] card:', card);
    if (!card.name) {
      toast('Got data but name is empty — partial extraction. See console.', 'err');
      return null;
    }
    return { card, avatarUrl, source, filled };
  }

  // ============================================================
  //  Export flows
  // ============================================================

  function fieldSummary(card) {
    // Show which substantive fields were populated. name + first_mes + at least one
    // of description/personality means "good import". Otherwise warn.
    const items = ['name', 'personality', 'description', 'first_mes'].map(k => {
      const v = card[k];
      return { k, ok: !!(v && String(v).trim()), len: v ? String(v).length : 0 };
    });
    return items;
  }

  // A card with only `name` filled is useless for CrushOn import regardless
  // of where the data came from. Block unconditionally when all three of
  // personality, description, first_mes are empty — this catches:
  //  - SSR/DOM fallback (no content available locally)
  //  - API success but server returned an empty character (rate-limited,
  //    content-moderated, or genuinely-empty draft)
  //  - SSR retry attempted with the long external_id but still failed
  function blockIfEmpty(card, source) {
    const noContent = !card.description && !card.personality && !card.first_mes;
    if (noContent) {
      console.warn('[CrushOn Importer] blocking export — card has only `name`. source:', source, 'card:', card);
      if (source === 'api' || source === 'api-via-ssr') {
        // API returned successfully but the character has no Tagline / Greeting
        // / Description / Definition. Either it is a draft (creator hasn't
        // filled the fields) or C.AI has hidden everything for some reason.
        toast('Character has no Tagline / Greeting / Description on C.AI. Fill those fields on Character.AI first, then re-export.', 'err');
      } else {
        // API path didn't even reach an authoritative response — likely a
        // network blip or token capture race. SSR/DOM fallback alone gives
        // us nothing useful for import.
        toast('API fetch failed — only got the name from the page. Wait a moment and try again, or refresh the page.', 'err');
      }
      return true;
    }
    return false;
  }

  // Best-effort fire-and-forget analytics. Never throws into export flow.
  function gaEvent(name, params) {
    try {
      const p = chrome.runtime.sendMessage({ type: 'ga-event', name, params: params || {} });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* extension context invalidated; ignore */ }
  }

  async function doExportJson(btn) {
    const orig = btn.textContent;
    btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = 'Exporting…';
    try {
      const r = await getCard();
      if (!r) {
        gaEvent('export_failed', { format: 'json', reason: 'fetch_failed' });
        return;
      }
      const { card, source } = r;
      if (blockIfEmpty(card, source)) {
        gaEvent('export_failed', { format: 'json', reason: 'extraction_error', source });
        return;
      }
      const json = JSON.stringify(card, null, '\t');
      const blob = new Blob([json], { type: 'application/json' });
      downloadBlob(blob, `${safeFilename(card.name)}.json`);
      const s = fieldSummary(card).map(f => `${f.k}${f.ok ? '✓' : '✗'}`).join(' ');
      const partial = !card.description && !card.personality;
      toast(
        `${partial ? '⚠️' : '✅'} JSON downloaded (${source}). ${s}`,
        partial ? 'err' : 'ok'
      );
      gaEvent('export_json', { source, partial: partial ? 'true' : 'false' });
    } catch (e) {
      console.error('[CrushOn Importer] json export error:', e);
      toast('JSON export failed. See console.', 'err');
      gaEvent('export_failed', { format: 'json', reason: 'unknown' });
    } finally {
      btn.disabled = false; btn.style.opacity = '1'; btn.textContent = orig;
    }
  }

  async function doExportPng(btn) {
    const orig = btn.textContent;
    btn.disabled = true; btn.style.opacity = '0.6'; btn.textContent = 'Building PNG…';
    try {
      const r = await getCard();
      if (!r) {
        gaEvent('export_failed', { format: 'png', reason: 'fetch_failed' });
        return;
      }
      const { card, avatarUrl, source } = r;
      if (blockIfEmpty(card, source)) {
        gaEvent('export_failed', { format: 'png', reason: 'extraction_error', source });
        return;
      }
      const pngBytes = await buildCharacterPng(card, avatarUrl);
      const blob = new Blob([pngBytes], { type: 'image/png' });
      downloadBlob(blob, `${safeFilename(card.name)}.png`);
      const s = fieldSummary(card).map(f => `${f.k}${f.ok ? '✓' : '✗'}`).join(' ');
      const partial = !card.description && !card.personality;
      toast(
        `${partial ? '⚠️' : '✅'} PNG downloaded (${source}). ${s}`,
        partial ? 'err' : 'ok'
      );
      gaEvent('export_png', { source, partial: partial ? 'true' : 'false' });
    } catch (e) {
      console.error('[CrushOn Importer] png export error:', e);
      toast('PNG export failed. See console.', 'err');
      gaEvent('export_failed', { format: 'png', reason: 'unknown' });
    } finally {
      btn.disabled = false; btn.style.opacity = '1'; btn.textContent = orig;
    }
  }

  // ============================================================
  //  UI: inject buttons
  // ============================================================

  const BTN_STYLE = `
    display: block;
    width: 100%;
    padding: 9px 14px;
    background: #ec4899;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(236,72,153,0.35);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    transition: opacity 0.15s, transform 0.1s;
    text-align: left;
  `;
  const BTN_STYLE_SECONDARY = BTN_STYLE.replace('#ec4899', '#a855f7').replace('rgba(236,72,153,0.35)', 'rgba(168,85,247,0.35)');

  function injectButtons() {
    if (document.getElementById(CONTAINER_ID)) return;
    const wrap = document.createElement('div');
    wrap.id = CONTAINER_ID;
    wrap.style.cssText = `
      position: fixed;
      top: 80px;
      right: 16px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 200px;
    `;

    const btnJson = document.createElement('button');
    btnJson.textContent = '📥 Export JSON';
    btnJson.style.cssText = BTN_STYLE;
    btnJson.addEventListener('click', () => doExportJson(btnJson));

    const btnPng = document.createElement('button');
    btnPng.textContent = '🎴 Export PNG Card';
    btnPng.style.cssText = BTN_STYLE_SECONDARY;
    btnPng.addEventListener('click', () => doExportPng(btnPng));

    wrap.appendChild(btnJson);
    wrap.appendChild(btnPng);
    document.body.appendChild(wrap);
  }

  function removeButtons() {
    const c = document.getElementById(CONTAINER_ID);
    if (c) c.remove();
  }

  function refresh() {
    if (isCharacterPage()) injectButtons();
    else removeButtons();
  }

  // ============================================================
  //  Init + SPA URL watcher
  // ============================================================

  refresh();
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(refresh, 600);
    }
  }).observe(document, { subtree: true, childList: true });
})();
