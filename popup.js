// popup.js — Manages the analytics opt-out toggle and fires popup_opened.
// CSP: inline scripts are forbidden under MV3 default CSP, so this lives
// in its own file rather than inside popup.html.

(async () => {
  const toggle = document.getElementById('analytics-toggle');

  // Restore saved state (default: enabled, matching privacy policy §6).
  try {
    const { analytics_enabled } = await chrome.storage.local.get('analytics_enabled');
    toggle.checked = analytics_enabled !== false;
  } catch (_) {
    toggle.checked = true;
  }

  // Persist user choice on change.
  toggle.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({ analytics_enabled: toggle.checked });
    } catch (_) { /* ignore */ }
  });

  // Fire popup_opened only if the user has analytics enabled. The background
  // service worker checks the same flag, so this is belt-and-suspenders.
  if (toggle.checked) {
    try {
      const p = chrome.runtime.sendMessage({
        type: 'ga-event',
        name: 'popup_opened',
        params: {},
      });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (_) { /* extension context invalidated */ }
  }
})();
