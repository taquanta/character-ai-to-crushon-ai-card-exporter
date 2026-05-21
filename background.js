// ============================================================================
// background.js — service worker
//
// Two responsibilities:
//  1. Proxy cross-origin fetches for the content script. In Manifest V3,
//     content scripts can NOT bypass CORS via host_permissions; only the
//     extension's service worker / extension pages can.
//  2. Send anonymous usage telemetry to Google Analytics 4 via the
//     Measurement Protocol. See privacy.html §6 for what is and isn't sent.
// ============================================================================

const GA_MEASUREMENT_ID = 'G-5PK616YD29';
const GA_API_SECRET = 'vBwtEN5cTlaI-5aW9i5DQg';
const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

// One session_id per service-worker lifetime. GA4 needs this (together with
// engagement_time_msec on each event) to count the user as "active" — without
// it, events arrive but the "active users" metric stays at 0.
const GA_SESSION_ID = String(Date.now());

// ---------- client_id (random UUID, persisted in chrome.storage.local) ------

async function getClientId() {
  const { ga_client_id } = await chrome.storage.local.get('ga_client_id');
  if (ga_client_id) return ga_client_id;
  const newId = (self.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await chrome.storage.local.set({ ga_client_id: newId });
  return newId;
}

// ---------- opt-in state (default ON; toggled from popup) -------------------

async function isAnalyticsEnabled() {
  const { analytics_enabled } = await chrome.storage.local.get('analytics_enabled');
  // Treat unset as enabled (default opt-in, as disclosed in privacy.html §6).
  return analytics_enabled !== false;
}

// ---------- core sender ----------------------------------------------------

async function sendGA(eventName, params = {}) {
  try {
    if (!(await isAnalyticsEnabled())) return;
    const clientId = await getClientId();
    const version = chrome.runtime.getManifest().version;
    await fetch(GA_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify({
        client_id: clientId,
        events: [{
          name: eventName,
          params: {
            version,
            session_id: GA_SESSION_ID,
            engagement_time_msec: 100,
            ...params,
          },
        }],
      }),
    });
  } catch (_e) {
    // Analytics must never break the extension; swallow every error.
  }
}

// ---------- install / update events ----------------------------------------

chrome.runtime.onInstalled.addListener((details) => {
  const params = { version: chrome.runtime.getManifest().version };
  if (details.reason === 'install') {
    sendGA('extension_installed', params);
  } else if (details.reason === 'update') {
    sendGA('extension_updated', {
      ...params,
      previous_version: details.previousVersion || 'unknown',
    });
  }
});

// ---------- message handlers (fetch proxy + ga-event from other contexts) --

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  // Telemetry events forwarded from content.js / popup.js
  if (req && req.type === 'ga-event') {
    sendGA(req.name, req.params || {});
    sendResponse({ ok: true });
    return false;
  }

  // Existing cross-origin fetch proxy for the content script.
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
