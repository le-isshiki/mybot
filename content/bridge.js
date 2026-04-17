/**
 * Bridge — runs in ISOLATED world (has chrome.* access).
 * 1. Injects content.js as a module into the page's MAIN world.
 * 2. Relays CustomEvents (page → background → popup).
 * 3. Forwards background messages back into the page.
 */

(function () {
  // Inject main trading script as ES module into page context
  const script = document.createElement('script');
  script.type  = 'module';
  script.src   = chrome.runtime.getURL('content/content.js');
  (document.head || document.documentElement).appendChild(script);

  // Page → background relay
  window.addEventListener('POT_BOT_EVENT', (evt) => {
    chrome.runtime.sendMessage({ type: 'CONTENT_EVENT', data: evt.detail }).catch(() => {});
  });

  // Background → page relay
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'CONFIG_UPDATE') {
      window.dispatchEvent(new CustomEvent('POT_BOT_CONFIG', { detail: msg.config }));
    }
    if (msg.type === 'GET_STATE') {
      window.dispatchEvent(new CustomEvent('POT_BOT_GET_STATE'));
    }
  });
})();
