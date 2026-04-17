/**
 * Background Service Worker
 * Manages extension state, persists config, and bridges popup ↔ content script.
 */

const DEFAULT_CONFIG = {
  enabled: false,
  asset: 'EURUSD_otc',
  expiry: 60,
  tradeAmount: 1,
  moneyMode: 'fixed_percent',
  basePercent: 1,
  martingaleMult: 2,
  maxMartingale: 3,
  minConfidence: 65,
  requiredAgreement: 2,
  cooldownMs: 60000,
  maxTradesPerHour: 8,
  demoMode: true,
  periods: [60, 300],
};

// ─── Startup ──────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get('config');
  if (!stored.config) {
    await chrome.storage.sync.set({ config: DEFAULT_CONFIG });
  }
  console.log('[BG] PocketOption Trading Bot installed');
});

// ─── Message Routing (popup ↔ content) ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_CONFIG':
      chrome.storage.sync.get('config').then(d => sendResponse(d.config || DEFAULT_CONFIG));
      return true;

    case 'SET_CONFIG':
      chrome.storage.sync.set({ config: msg.config }).then(() => {
        // Forward config to active PO tabs
        broadcastToPoTabs({ type: 'CONFIG_UPDATE', config: msg.config });
        sendResponse({ ok: true });
      });
      return true;

    case 'GET_STATE':
      broadcastToPoTabs({ type: 'GET_STATE' });
      sendResponse({ ok: true });
      return true;

    case 'CONTENT_EVENT':
      // Relay content-script events to popup
      chrome.runtime.sendMessage({ type: 'FROM_CONTENT', data: msg.data }).catch(() => {});
      sendResponse({ ok: true });
      return true;
  }
});

async function broadcastToPoTabs(msg) {
  const tabs = await chrome.tabs.query({ url: ['*://*.pocketoption.com/*', '*://*.po.market/*'] });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
  }
}

// Keep service worker alive with a periodic alarm
chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') console.log('[BG] alive');
});
