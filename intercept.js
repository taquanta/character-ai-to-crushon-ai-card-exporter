// CrushOn Importer — page-world auth-token sniffer.
// Runs in MAIN world at document_start so we install hooks before C.AI's
// own client makes any request. We watch every fetch / XHR for an
// "Authorization: Token <hex>" header and persist the most recent value
// into a <meta cai_token="..."> tag in <head>. The content script (isolated
// world) reads this meta tag and replays the token against C.AI's API,
// which is the only way to fetch full character objects (greeting +
// definition) without owning the character.
//
// Why MAIN world: in the isolated world we couldn't shadow window.fetch
// or XMLHttpRequest in a way that observes the page's own requests.
// Why this is safe-ish: we only READ headers, never modify them, and we
// re-dispatch the original call unchanged.

(() => {
  'use strict';

  if (window.__crushonImporterInterceptInstalled) return;
  window.__crushonImporterInterceptInstalled = true;

  const META_NAME = 'cai_token';
  let lastToken = null;

  function persistToken(value) {
    if (typeof value !== 'string') return;
    const v = value.trim();
    // Only accept the canonical "Token <hex>" form C.AI uses.
    if (!/^Token\s+[A-Za-z0-9._-]+/i.test(v)) return;
    if (v === lastToken) return;
    lastToken = v;

    const write = () => {
      let meta = document.querySelector(`meta[${META_NAME}]`);
      if (!meta) {
        meta = document.createElement('meta');
        document.head.appendChild(meta);
      }
      meta.setAttribute(META_NAME, v);
    };
    if (document.head) write();
    else document.addEventListener('DOMContentLoaded', write, { once: true });
  }

  function extractAuthFromHeaders(headers) {
    if (!headers) return null;
    try {
      if (headers instanceof Headers) {
        return headers.get('authorization') || headers.get('Authorization');
      }
      if (Array.isArray(headers)) {
        for (const pair of headers) {
          if (Array.isArray(pair) && pair[0] && String(pair[0]).toLowerCase() === 'authorization') {
            return pair[1];
          }
        }
        return null;
      }
      if (typeof headers === 'object') {
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === 'authorization') return headers[k];
        }
      }
    } catch (_) {}
    return null;
  }

  // -- fetch hook --------------------------------------------------------
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      try {
        let auth = null;
        if (init && init.headers) auth = extractAuthFromHeaders(init.headers);
        if (!auth && input && typeof input === 'object' && input.headers) {
          // input was a Request object
          auth = extractAuthFromHeaders(input.headers);
        }
        if (auth) persistToken(auth);
      } catch (_) {}
      return origFetch.apply(this, arguments);
    };
  }

  // -- XMLHttpRequest hook ----------------------------------------------
  const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      if (name && String(name).toLowerCase() === 'authorization') {
        persistToken(value);
      }
    } catch (_) {}
    return origSetRequestHeader.apply(this, arguments);
  };
})();
