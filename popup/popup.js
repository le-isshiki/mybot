/**
 * Popup UI Controller
 * Loads config from storage, sends updates to content script,
 * and displays live trading data.
 */

let config = {};

// ─── Tab Navigation ─────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
  });
});

// ─── Load Config ─────────────────────────────────────────────────────────
async function loadConfig() {
  config = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
  applyConfigToUI(config);
}

function applyConfigToUI(cfg) {
  // Dashboard
  document.getElementById('toggle-enabled').checked = cfg.enabled;

  // Strategy panel
  document.getElementById('cfg-asset').value      = cfg.asset || 'EURUSD_otc';
  document.getElementById('cfg-expiry').value     = cfg.expiry || 60;
  document.getElementById('cfg-period').value     = (cfg.periods?.[0] || 60).toString();
  document.getElementById('cfg-confidence').value = cfg.minConfidence || 65;
  document.getElementById('cfg-agreement').value  = cfg.requiredAgreement || 2;
  document.getElementById('cfg-cooldown').value   = (cfg.cooldownMs || 60000) / 1000;
  document.getElementById('cfg-maxhour').value    = cfg.maxTradesPerHour || 8;
  document.getElementById('cfg-demo').checked     = cfg.demoMode ?? true;

  // Money panel
  document.getElementById('cfg-money-mode').value = cfg.moneyMode || 'fixed_percent';
  document.getElementById('cfg-amount').value     = cfg.tradeAmount || 1;
  document.getElementById('cfg-percent').value    = cfg.basePercent || 1;
  document.getElementById('cfg-mult').value       = cfg.martingaleMult || 2;
  document.getElementById('cfg-maxlevel').value   = cfg.maxMartingale || 3;
  document.getElementById('cfg-daily-loss').value = cfg.maxDailyLoss || 20;

  // Badge
  const badge = document.getElementById('mode-badge');
  if (cfg.demoMode) { badge.textContent = 'DEMO'; badge.className = 'badge badge-demo'; }
  else               { badge.textContent = 'LIVE'; badge.className = 'badge badge-live'; }

  updateMoneyModeUI(cfg.moneyMode);
}

// ─── Enable Toggle ────────────────────────────────────────────────────────
document.getElementById('toggle-enabled').addEventListener('change', async (e) => {
  config.enabled = e.target.checked;
  await saveConfig(config);
  updateBotStatus(config.enabled);
});

// ─── Strategy Save ────────────────────────────────────────────────────────
document.getElementById('btn-save-strategy').addEventListener('click', async () => {
  const period = parseInt(document.getElementById('cfg-period').value);
  Object.assign(config, {
    asset:             document.getElementById('cfg-asset').value,
    expiry:            parseInt(document.getElementById('cfg-expiry').value),
    periods:           [period, period * 5],
    minConfidence:     parseInt(document.getElementById('cfg-confidence').value),
    requiredAgreement: parseInt(document.getElementById('cfg-agreement').value),
    cooldownMs:        parseInt(document.getElementById('cfg-cooldown').value) * 1000,
    maxTradesPerHour:  parseInt(document.getElementById('cfg-maxhour').value),
    demoMode:          document.getElementById('cfg-demo').checked,
  });
  await saveConfig(config);
  flashSaved('btn-save-strategy');
});

// ─── Money Save ───────────────────────────────────────────────────────────
document.getElementById('btn-save-money').addEventListener('click', async () => {
  Object.assign(config, {
    moneyMode:     document.getElementById('cfg-money-mode').value,
    tradeAmount:   parseFloat(document.getElementById('cfg-amount').value),
    basePercent:   parseFloat(document.getElementById('cfg-percent').value),
    martingaleMult: parseFloat(document.getElementById('cfg-mult').value),
    maxMartingale: parseInt(document.getElementById('cfg-maxlevel').value),
    maxDailyLoss:  parseInt(document.getElementById('cfg-daily-loss').value),
  });
  await saveConfig(config);
  flashSaved('btn-save-money');
});

// Money mode — show/hide relevant fields
document.getElementById('cfg-money-mode').addEventListener('change', (e) => {
  updateMoneyModeUI(e.target.value);
});

function updateMoneyModeUI(mode) {
  document.getElementById('row-fixed').style.display      = mode === 'fixed' ? '' : 'none';
  document.getElementById('row-percent').style.display    = ['fixed_percent','kelly'].includes(mode) ? '' : 'none';
  document.getElementById('row-martingale').style.display = mode.includes('martingale') ? '' : 'none';
}

// ─── Clear Log ────────────────────────────────────────────────────────────
document.getElementById('btn-clear-log').addEventListener('click', () => {
  document.getElementById('log-panel').innerHTML = '';
});

// ─── Save Config Helper ────────────────────────────────────────────────────
async function saveConfig(cfg) {
  await chrome.runtime.sendMessage({ type: 'SET_CONFIG', config: cfg });

  // Also dispatch to active tab's content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    chrome.tabs.sendMessage(tab.id, { type: 'CONFIG_UPDATE', config: cfg }).catch(() => {});
  }
}

// ─── Live Data Updates (from content script via background) ───────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'FROM_CONTENT') return;
  const data = msg.data;
  switch (data.type) {
    case 'BALANCE':
      document.getElementById('balance-display').textContent = `$${parseFloat(data.balance).toFixed(2)}`;
      document.getElementById('ws-dot').classList.add('active');
      break;

    case 'SIGNAL':
      renderSignal(data.signal);
      break;

    case 'TRADE_PLACED':
      appendLog('info', `Trade placed: ${data.trade.signal} $${data.trade.amount.toFixed(2)}`);
      break;

    case 'TRADE_RESULT':
      const cls = data.outcome === 'win' ? 'green' : 'red';
      const pnl = data.profit >= 0 ? `+$${data.profit.toFixed(2)}` : `-$${Math.abs(data.profit).toFixed(2)}`;
      appendLog(data.outcome === 'win' ? 'info' : 'warn', `Result: ${data.outcome.toUpperCase()} ${pnl}`);
      updateStats(data.stats);
      break;

    case 'STATE':
      updateStats(data.stats);
      document.getElementById('stat-candles').textContent = data.candleCount;
      if (data.lastSignal) renderSignal(data.lastSignal);
      document.getElementById('balance-display').textContent = `$${parseFloat(data.balance || 0).toFixed(2)}`;
      break;

    case 'LOG':
      appendLog(data.level, data.msg);
      if (data.level === 'info') {
        document.getElementById('ws-dot').classList.add('active');
        document.getElementById('ws-dot').classList.remove('warning');
      }
      break;
  }
});

function renderSignal(sig) {
  if (!sig) return;
  const dirEl = document.getElementById('sig-direction');
  const confEl = document.getElementById('sig-confidence');
  const fillEl = document.getElementById('conf-fill');
  const stratsEl = document.getElementById('sig-strategies');

  dirEl.textContent = sig.signal || 'NO SIGNAL';
  dirEl.className = `sig-dir ${(sig.signal || '').toLowerCase() || 'none'}`;
  confEl.textContent = `Confidence: ${sig.confidence || 0}% (${sig.agreement || 0}/4 strategies)`;
  fillEl.style.width = `${sig.confidence || 0}%`;
  fillEl.style.background = sig.confidence >= 75 ? 'var(--green)' : sig.confidence >= 60 ? 'var(--yellow)' : 'var(--red)';

  stratsEl.innerHTML = (sig.strategies || []).map(s =>
    `<div class="strat-line">${escHtml(s)}</div>`
  ).join('');
}

function updateStats(stats) {
  if (!stats) return;
  document.getElementById('stat-trades').textContent  = stats.total;
  document.getElementById('stat-winrate').textContent = `${stats.winRate}%`;
  const pnlEl = document.getElementById('stat-pnl');
  pnlEl.textContent = `$${stats.dailyPnL}`;
  pnlEl.className = `stat-val ${parseFloat(stats.dailyPnL) >= 0 ? 'green' : 'red'}`;
}

function updateBotStatus(enabled) {
  const dot  = document.getElementById('bot-dot');
  const text = document.getElementById('bot-status-text');
  dot.classList.toggle('active', enabled);
  dot.classList.toggle('warning', false);
  text.textContent = enabled ? 'Bot active — scanning for signals' : 'Bot inactive';
}

const logPanel = document.getElementById('log-panel');
function appendLog(level, msg) {
  const ts  = new Date().toLocaleTimeString('en-US', { hour12: false });
  const div = document.createElement('div');
  div.className = `log-line ${level}`;
  div.textContent = `[${ts}] ${msg}`;
  logPanel.appendChild(div);
  logPanel.scrollTop = logPanel.scrollHeight;
  // Keep only last 200 entries
  while (logPanel.children.length > 200) logPanel.removeChild(logPanel.firstChild);
}

function flashSaved(btnId) {
  const btn = document.getElementById(btnId);
  const orig = btn.textContent;
  btn.textContent = 'Saved!';
  btn.style.background = 'var(--green)';
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1500);
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Init ─────────────────────────────────────────────────────────────────
loadConfig();
updateBotStatus(false);

// Request current state from content script
setTimeout(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'GET_STATE' }).catch(() => {});
}, 300);
