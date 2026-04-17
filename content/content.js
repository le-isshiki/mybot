/**
 * Main trading engine — loaded as an ES module into the page's MAIN world.
 * Imports from ../lib/*.js resolve as chrome-extension:// URLs.
 *
 * Flow:
 *   WS tick  →  CandleBuilder  →  SignalProcessor  →  TradeExecutor
 *   Config changes arrive via CustomEvent 'POT_BOT_CONFIG' from bridge.js
 */

import { MultiTimeframeCandleBuilder } from '../lib/candle_builder.js';
import { SignalProcessor }             from '../lib/signal_processor.js';
import { MoneyManager }                from '../lib/money_manager.js';

// ─── Default Configuration ────────────────────────────────────────────────
let CFG = {
  enabled:           false,
  asset:             'EURUSD_otc',
  expiry:            60,
  tradeAmount:       1,
  moneyMode:         'fixed_percent',
  basePercent:       1,
  maxTradePercent:   5,
  martingaleMult:    2,
  maxMartingale:     3,
  maxDailyLoss:      20,
  minConfidence:     65,
  requiredAgreement: 2,
  cooldownMs:        60000,
  maxTradesPerHour:  8,
  demoMode:          true,
  periods:           [60, 300],
};

// ─── Module instances ─────────────────────────────────────────────────────
let mtf      = new MultiTimeframeCandleBuilder(CFG.periods);
let sigProc  = new SignalProcessor({ ...CFG });
let moneyMgr = new MoneyManager({ ...CFG });

let currentBalance = 0;
let activeAsset    = '';
let pendingTrade   = null;
const tradeLog     = [];

// ─── WebSocket Monkey-Patch ───────────────────────────────────────────────
// Must run before PocketOption's app code initialises its WebSocket.
const OriginalWS = window.WebSocket;

function PatchedWebSocket(url, protocols) {
  const ws = protocols ? new OriginalWS(url, protocols) : new OriginalWS(url);

  const isPO = /po\.market|pocketoption\.com/i.test(url);
  if (isPO) {
    log('info', `WS connected → ${url}`);

    ws.addEventListener('message', (evt) => {
      try { parseSocketIO(evt.data); } catch (_) {}
    });
    ws.addEventListener('open',  () => { log('info', 'WS open'); notifyPopup({ type: 'WS_OPEN' }); });
    ws.addEventListener('close', () => { log('warn', 'WS closed'); });
    ws.addEventListener('error', () => { log('error', 'WS error'); });
  }
  return ws;
}

// Copy static members so the patched constructor behaves like the original
PatchedWebSocket.prototype         = OriginalWS.prototype;
PatchedWebSocket.CONNECTING        = OriginalWS.CONNECTING;
PatchedWebSocket.OPEN              = OriginalWS.OPEN;
PatchedWebSocket.CLOSING           = OriginalWS.CLOSING;
PatchedWebSocket.CLOSED            = OriginalWS.CLOSED;
window.WebSocket                   = PatchedWebSocket;

// ─── Socket.IO Parser ─────────────────────────────────────────────────────
// PocketOption uses Socket.IO v4:  42["event", payload]
function parseSocketIO(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('42')) return;
  let arr;
  try { arr = JSON.parse(raw.slice(2)); } catch { return; }
  if (!Array.isArray(arr) || arr.length < 1) return;

  const [event, data] = arr;
  switch (event) {
    // Real-time price tick
    case 'tick': case 'quote': case 'price': case 'stream':
      handleTick(data);  break;

    // Full candle / history batch
    case 'candle': case 'candles': case 'history': case 'chart':
      handleCandleBatch(data);  break;

    // Balance update
    case 'balance': case 'user-balance': case 'wallet':
      handleBalance(data);  break;

    // Trade result
    case 'deal-complete': case 'trade-complete': case 'result':
    case 'success-trade': case 'close-deal':
      handleResult(data);  break;

    // Auth
    case 'success-auth': case 'auth':
      log('info', 'Authenticated ✓');  break;

    // Catch-all — scan for embedded price data in any message
    default:
      if (data && typeof data === 'object') deepScanForTick(data);
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────
function handleTick(data) {
  if (!data) return;
  // Support multiple field name conventions
  const asset = data.asset || data.symbol || data.pair || data.id || '';
  const price  = +( data.price ?? data.value ?? data.close ?? data.ask ?? data.bid ?? 0 );
  const ts     = data.time ?? data.timestamp ?? data.t ?? Date.now();
  if (!price || price <= 0) return;

  if (asset) activeAsset = asset;
  const tsMs = ts > 1e12 ? ts : ts * 1000;  // normalise to milliseconds
  mtf.addTick(price, tsMs);
  scheduleAnalysis(asset || CFG.asset, price);
}

function handleCandleBatch(data) {
  const list = Array.isArray(data) ? data
    : (data?.candles ?? data?.history ?? data?.data ?? []);
  if (!Array.isArray(list)) return;
  for (const c of list) {
    const p  = +(c.close ?? c.c ?? c.price ?? 0);
    const ts = c.time ?? c.t ?? c.timestamp ?? 0;
    if (p > 0 && ts > 0) mtf.addTick(p, ts > 1e12 ? ts : ts * 1000);
  }
}

function handleBalance(data) {
  const b = +(data?.balance ?? data?.amount ?? data?.value ?? data ?? 0);
  if (b > 0) {
    currentBalance = b;
    notifyPopup({ type: 'BALANCE', balance: b });
    log('info', `Balance: $${b.toFixed(2)}`);
  }
}

function handleResult(data) {
  if (!pendingTrade) return;
  const profit  = +(data?.profit ?? data?.amount ?? data?.win ?? 0);
  const outcome = profit > 0 ? 'win' : 'loss';
  moneyMgr.recordResult(outcome, pendingTrade.amount);
  log('info', `Trade ${outcome.toUpperCase()} | ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`);
  tradeLog.push({ ...pendingTrade, outcome, profit, closed: Date.now() });
  notifyPopup({ type: 'TRADE_RESULT', outcome, profit, stats: moneyMgr.getStats() });
  pendingTrade = null;
}

function deepScanForTick(obj) {
  const s = JSON.stringify(obj);
  if (s.includes('"price"') || s.includes('"close"') || s.includes('"value"')) {
    handleTick(obj);
  }
}

// ─── Analysis (debounced every 500 ms) ───────────────────────────────────
let analysisTimer = null;
function scheduleAnalysis(asset, price) {
  if (analysisTimer) return;
  analysisTimer = setTimeout(() => {
    analysisTimer = null;
    runAnalysis(asset, price);
  }, 500);
}

function runAnalysis(asset) {
  if (!CFG.enabled) return;
  if (moneyMgr.isDailyLimitReached(currentBalance)) {
    log('warn', 'Daily loss limit reached — bot paused');
    return;
  }
  const candles = mtf.getCandles(CFG.periods[0]);
  if (candles.length < 30) return;

  const sig = sigProc.process(candles, asset);
  if (!sig) return;

  log('info', `▶ ${sig.signal} on ${sig.asset} | conf:${sig.confidence}% (${sig.agreement}/4 agree)`);
  sig.strategies.forEach(s => log('info', `  ${s}`));
  notifyPopup({ type: 'SIGNAL', signal: sig });
  executeTrade(sig);
}

// ─── Trade Executor ───────────────────────────────────────────────────────
async function executeTrade(sig) {
  if (!CFG.enabled) return;
  if (pendingTrade) { log('warn', 'Trade already pending — skipping'); return; }

  const amount = CFG.moneyMode === 'fixed'
    ? CFG.tradeAmount
    : moneyMgr.getTradeAmount(currentBalance || 100, sig.confidence);

  log('info', `Placing ${sig.signal} | $${amount.toFixed(2)} | expiry ${CFG.expiry}s`);

  try {
    await setAmount(amount);
    await delay(200);
    await setExpiry(CFG.expiry);
    await delay(200);
    await clickDirection(sig.signal);

    pendingTrade = { signal: sig.signal, amount, asset: sig.asset, confidence: sig.confidence, opened: Date.now() };
    notifyPopup({ type: 'TRADE_PLACED', trade: pendingTrade });
    log('info', `Trade placed ✓`);
  } catch (err) {
    log('error', `Execution failed: ${err.message}`);
  }
}

async function setAmount(amount) {
  const SELECTORS = [
    '[class*="amount"] input[type="text"]',
    '[class*="amount"] input[type="number"]',
    '[data-id="deal-amount"] input',
    '[data-testid="amount-input"]',
    '.deal__amount input',
    '.trade-amount input',
    'input[name="amount"]',
    'input[placeholder*="mount" i]',
    'input[class*="Amount"]',
    '.trading-panel input[type="number"]',
  ];
  const el = query(SELECTORS);
  if (!el) throw new Error('Amount input not found');

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, amount.toFixed(2));
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function setExpiry(seconds) {
  // Try button-based expiry picker
  const allBtns = document.querySelectorAll('button, [class*="expir"], [class*="time"]');
  for (const btn of allBtns) {
    const t = btn.textContent.trim();
    if (t === `${seconds}s` || t === `${seconds / 60}m` || t === `${seconds / 60} min`
        || (seconds >= 60 && t === `${seconds / 60}`) ) {
      btn.click();
      return;
    }
  }
  // Try input-based expiry
  const inp = query(['input[name="time"]', '[class*="expiry"] input', '[class*="expiration"] input']);
  if (inp) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inp, seconds);
    inp.dispatchEvent(new Event('input',  { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

async function clickDirection(direction) {
  const CALL = [
    'button[class*="call"]:not([disabled])',
    'button[class*="Call"]:not([disabled])',
    'button[class*="high"]:not([disabled])',
    'button[class*="up"]:not([disabled])',
    '[data-direction="call"]:not([disabled])',
    '.btn-call:not([disabled])',
    '.call-btn:not([disabled])',
    'button[class*="green"]:not([disabled])',
    '[class*="btn"][class*="call"]:not([disabled])',
  ];
  const PUT = [
    'button[class*="put"]:not([disabled])',
    'button[class*="Put"]:not([disabled])',
    'button[class*="low"]:not([disabled])',
    'button[class*="down"]:not([disabled])',
    '[data-direction="put"]:not([disabled])',
    '.btn-put:not([disabled])',
    '.put-btn:not([disabled])',
    'button[class*="red"]:not([disabled])',
    '[class*="btn"][class*="put"]:not([disabled])',
  ];

  const btn = query(direction === 'CALL' ? CALL : PUT);
  if (!btn) throw new Error(`${direction} button not found — verify Pocket Option DOM`);
  btn.click();
}

// ─── Config hot-reload ────────────────────────────────────────────────────
window.addEventListener('POT_BOT_CONFIG', (evt) => {
  const c = evt.detail;
  Object.assign(CFG, c);

  // Rebuild modules if periods changed
  if (c.periods) {
    mtf = new MultiTimeframeCandleBuilder(CFG.periods);
  }
  // Re-apply settings
  sigProc.minConfidence      = CFG.minConfidence;
  sigProc.requiredAgreement  = CFG.requiredAgreement;
  sigProc.cooldownMs         = CFG.cooldownMs;
  sigProc.maxTradesPerHour   = CFG.maxTradesPerHour;
  moneyMgr.mode              = CFG.moneyMode;
  moneyMgr.basePercent       = CFG.basePercent;
  moneyMgr.maxTradePercent   = CFG.maxTradePercent;
  moneyMgr.martingaleMult    = CFG.martingaleMult;
  moneyMgr.maxMartingale     = CFG.maxMartingale;
  moneyMgr.maxDailyLoss      = CFG.maxDailyLoss;

  log('info', `Config updated | enabled:${CFG.enabled} demo:${CFG.demoMode}`);
});

window.addEventListener('POT_BOT_GET_STATE', () => {
  notifyPopup({
    type:       'STATE',
    config:     CFG,
    stats:      moneyMgr.getStats(),
    balance:    currentBalance,
    candleCount: mtf.getCandles(CFG.periods[0]).length,
    lastSignal: sigProc.getLastSignal(),
    tradeLog:   tradeLog.slice(-20),
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function query(selectors) {
  for (const s of selectors) {
    try { const el = document.querySelector(s); if (el) return el; } catch {}
  }
  return null;
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function notifyPopup(data) {
  window.dispatchEvent(new CustomEvent('POT_BOT_EVENT', { detail: data }));
}

function log(level, msg) {
  const prefix = '[PocketBot]';
  const full   = `${prefix} ${msg}`;
  if (level === 'error') console.error(full);
  else if (level === 'warn') console.warn(full);
  else console.log(full);
  notifyPopup({ type: 'LOG', level, msg, time: Date.now() });
}

log('info', '✓ Trading engine loaded — WebSocket interceptor active');
