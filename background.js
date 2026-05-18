// Background service worker — proxies cross-origin fetches for the content
// script. In Manifest V3, content scripts can NOT bypass CORS via
// host_permissions; only the extension's service worker / extension pages can.
// We expose a single 'cai-fetch' message that performs the fetch in worker
// context (where host_permissions DO grant CORS bypass for declared hosts).

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (!req || req.type !== 'cai-fetch') return false;

  (async () => {
    try {
      const opts = {
        method: req.method || 'GET',
        credentials: 'include',
        headers: req.headers || {},
      };
      if (req.body != null) {
        opts.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }

      const res = await fetch(req.url, opts);
      let data = null;
      let text = null;
      const ct = (res.headers.get('content-type') || '').toLowerCase();

      if (ct.includes('json')) {
        try { data = await res.json(); }
        catch (_e) { try { text = await res.text(); } catch (_) {} }
      } else {
        try { text = await res.text(); } catch (_) {}
        // sometimes APIs return JSON without a json content-type
        if (text) {
          try { data = JSON.parse(text); text = null; } catch (_) {}
        }
      }

      sendResponse({
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        data,
        text,
      });
    } catch (e) {
      sendResponse({ ok: false, status: 0, error: String(e?.message || e) });
    }
  })();

  return true; // Keep message channel open for async sendResponse
});
