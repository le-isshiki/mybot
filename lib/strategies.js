/**
 * Trading Strategies for OTC Binary Options
 * Each strategy returns: { signal: 'CALL'|'PUT'|null, confidence: 0-100, reason: string }
 */

import { ema, rsi, macd, bollingerBands, stochastic, candlePattern, getSupportResistance } from './indicators.js';

function closes(candles) { return candles.map(c => c.close); }
function highs(candles)  { return candles.map(c => c.high); }
function lows(candles)   { return candles.map(c => c.low); }

// ─── Strategy 1: RSI + EMA Trend Confluence ──────────────────────────────────
// Trend: EMA9 vs EMA21 direction. Entry: RSI extreme reversal aligned with trend.
export function strategyRsiEma(candles) {
  if (candles.length < 30) return { signal: null, confidence: 0, reason: 'Insufficient data' };
  const c = closes(candles);
  const price = c[c.length - 1];
  const ema9  = ema(c, 9);
  const ema21 = ema(c, 21);
  const ema50 = ema(c, Math.min(50, c.length));
  const rsiVal = rsi(c, 14);

  if (isNaN(ema9) || isNaN(ema21) || isNaN(rsiVal)) return { signal: null, confidence: 0, reason: 'Not enough data' };

  const bullTrend = ema9 > ema21 && ema21 > ema50;
  const bearTrend = ema9 < ema21 && ema21 < ema50;
  const priceAboveEma21 = price > ema21;
  const priceBelowEma21 = price < ema21;

  let signal = null, confidence = 0, reason = '';

  if (bullTrend && rsiVal < 35 && priceAboveEma21) {
    signal = 'CALL';
    confidence = 75 + Math.max(0, 35 - rsiVal);
    reason = `Bullish EMA stack (${ema9.toFixed(5)}>${ema21.toFixed(5)}), RSI oversold at ${rsiVal.toFixed(1)}`;
  } else if (bearTrend && rsiVal > 65 && priceBelowEma21) {
    signal = 'PUT';
    confidence = 75 + Math.max(0, rsiVal - 65);
    reason = `Bearish EMA stack (${ema9.toFixed(5)}<${ema21.toFixed(5)}), RSI overbought at ${rsiVal.toFixed(1)}`;
  } else if (!bullTrend && !bearTrend && rsiVal < 25) {
    signal = 'CALL';
    confidence = 60;
    reason = `RSI deeply oversold at ${rsiVal.toFixed(1)} (range-bound)`;
  } else if (!bullTrend && !bearTrend && rsiVal > 75) {
    signal = 'PUT';
    confidence = 60;
    reason = `RSI deeply overbought at ${rsiVal.toFixed(1)} (range-bound)`;
  }

  return { signal, confidence: Math.min(confidence, 95), reason };
}

// ─── Strategy 2: MACD + Bollinger Bands Breakout ─────────────────────────────
// MACD crossover confirmation + price at BB extremes for mean-reversion.
export function strategyMacdBB(candles) {
  if (candles.length < 40) return { signal: null, confidence: 0, reason: 'Insufficient data' };
  const c = closes(candles);
  const price = c[c.length - 1];
  const prevPrice = c[c.length - 2];
  const { macd: macdVal, signal: signalLine, histogram } = macd(c, 12, 26, 9);
  const bb = bollingerBands(c, 20, 2);

  if (isNaN(macdVal) || isNaN(bb.upper)) return { signal: null, confidence: 0, reason: 'Not enough data' };

  // Previous histogram value (need prev macd data)
  const c_prev = c.slice(0, -1);
  const { histogram: prevHistogram } = macd(c_prev, 12, 26, 9);

  const macdCrossedUp   = !isNaN(prevHistogram) && prevHistogram < 0 && histogram > 0;
  const macdCrossedDown = !isNaN(prevHistogram) && prevHistogram > 0 && histogram < 0;
  const atLowerBand = price <= bb.lower;
  const atUpperBand = price >= bb.upper;
  const bbSqueeze = bb.bandwidth < 0.002; // Tight bands = volatility compression

  let signal = null, confidence = 0, reason = '';

  if (macdCrossedUp && atLowerBand) {
    signal = 'CALL';
    confidence = 85;
    reason = `MACD bullish cross + price at lower BB (${bb.lower.toFixed(5)})`;
  } else if (macdCrossedDown && atUpperBand) {
    signal = 'PUT';
    confidence = 85;
    reason = `MACD bearish cross + price at upper BB (${bb.upper.toFixed(5)})`;
  } else if (macdCrossedUp && !atUpperBand) {
    signal = 'CALL';
    confidence = 65;
    reason = `MACD bullish crossover, histogram: ${histogram.toFixed(6)}`;
  } else if (macdCrossedDown && !atLowerBand) {
    signal = 'PUT';
    confidence = 65;
    reason = `MACD bearish crossover, histogram: ${histogram.toFixed(6)}`;
  } else if (bbSqueeze && histogram > 0 && price > bb.middle) {
    signal = 'CALL';
    confidence = 55;
    reason = `BB squeeze breakout upward (bandwidth: ${(bb.bandwidth * 100).toFixed(3)}%)`;
  } else if (bbSqueeze && histogram < 0 && price < bb.middle) {
    signal = 'PUT';
    confidence = 55;
    reason = `BB squeeze breakout downward (bandwidth: ${(bb.bandwidth * 100).toFixed(3)}%)`;
  }

  return { signal, confidence, reason };
}

// ─── Strategy 3: Stochastic + Candlestick Pattern at S/R Levels ───────────────
// Most reliable for OTC: finds key price levels and trades confirmed reversals.
export function strategyPatternSR(candles) {
  if (candles.length < 20) return { signal: null, confidence: 0, reason: 'Insufficient data' };
  const c = closes(candles);
  const h = highs(candles);
  const l = lows(candles);
  const price = c[c.length - 1];

  const stoch = stochastic(h, l, c, 14, 3);
  const pattern = candlePattern(candles);
  const levels = getSupportResistance(candles, 50, 0.0005);

  if (isNaN(stoch.k)) return { signal: null, confidence: 0, reason: 'Not enough data' };

  // Check if price is near a significant S/R level
  const nearLevel = levels.find(lvl => Math.abs(lvl.price - price) / price < 0.001);
  const atSupport    = nearLevel?.type === 'support';
  const atResistance = nearLevel?.type === 'resistance';

  let signal = null, confidence = 0, reason = '';

  if (atSupport && pattern === 'bullish' && stoch.k < 30) {
    signal = 'CALL';
    confidence = 90;
    reason = `Bullish ${pattern} candle at support ${nearLevel.price.toFixed(5)} (strength:${nearLevel.strength}), Stoch K=${stoch.k.toFixed(1)}`;
  } else if (atResistance && pattern === 'bearish' && stoch.k > 70) {
    signal = 'PUT';
    confidence = 90;
    reason = `Bearish ${pattern} candle at resistance ${nearLevel.price.toFixed(5)} (strength:${nearLevel.strength}), Stoch K=${stoch.k.toFixed(1)}`;
  } else if (pattern === 'bullish' && stoch.k < 20) {
    signal = 'CALL';
    confidence = 65;
    reason = `Bullish candle pattern + Stoch oversold at ${stoch.k.toFixed(1)}`;
  } else if (pattern === 'bearish' && stoch.k > 80) {
    signal = 'PUT';
    confidence = 65;
    reason = `Bearish candle pattern + Stoch overbought at ${stoch.k.toFixed(1)}`;
  }

  return { signal, confidence, reason };
}

// ─── Strategy 4: Triple EMA Scalping (pure trend-following) ──────────────────
// Fast scalping strategy: EMA5/EMA13/EMA21 alignment + price momentum.
export function strategyTripleEma(candles) {
  if (candles.length < 25) return { signal: null, confidence: 0, reason: 'Insufficient data' };
  const c = closes(candles);
  const price = c[c.length - 1];
  const prevPrice = c[c.length - 3];
  const ema5  = ema(c, 5);
  const ema13 = ema(c, 13);
  const ema21 = ema(c, 21);
  const rsiVal = rsi(c, 7); // Fast RSI for scalping

  if (isNaN(ema5) || isNaN(ema13) || isNaN(ema21)) return { signal: null, confidence: 0, reason: 'Not enough data' };

  const bullAlign = ema5 > ema13 && ema13 > ema21;
  const bearAlign = ema5 < ema13 && ema13 < ema21;
  const priceUp   = price > prevPrice;
  const priceDown = price < prevPrice;
  const momentum  = ((price - prevPrice) / prevPrice) * 10000; // in pips * 10

  let signal = null, confidence = 0, reason = '';

  if (bullAlign && priceUp && rsiVal < 70) {
    signal = 'CALL';
    confidence = 70 + Math.min(15, Math.abs(momentum));
    reason = `Triple EMA bullish align (5>${ema5.toFixed(5)} 13>${ema13.toFixed(5)} 21), RSI=${rsiVal.toFixed(1)}`;
  } else if (bearAlign && priceDown && rsiVal > 30) {
    signal = 'PUT';
    confidence = 70 + Math.min(15, Math.abs(momentum));
    reason = `Triple EMA bearish align, RSI=${rsiVal.toFixed(1)}`;
  }

  return { signal, confidence: Math.min(confidence, 88), reason };
}

// ─── Master Signal Aggregator ─────────────────────────────────────────────────
// Runs all strategies, requires 2+ agreement above threshold to fire.
export function aggregateSignals(candles, minConfidence = 60, requiredAgreement = 2) {
  const results = [
    { name: 'RSI_EMA',       ...strategyRsiEma(candles) },
    { name: 'MACD_BB',       ...strategyMacdBB(candles) },
    { name: 'Pattern_SR',    ...strategyPatternSR(candles) },
    { name: 'Triple_EMA',    ...strategyTripleEma(candles) },
  ];

  const calls = results.filter(r => r.signal === 'CALL' && r.confidence >= minConfidence);
  const puts  = results.filter(r => r.signal === 'PUT'  && r.confidence >= minConfidence);

  if (calls.length >= requiredAgreement) {
    const avgConf = calls.reduce((s, r) => s + r.confidence, 0) / calls.length;
    return {
      signal: 'CALL',
      confidence: Math.round(avgConf),
      agreement: calls.length,
      strategies: calls.map(r => `${r.name}(${r.confidence}%): ${r.reason}`),
      allResults: results
    };
  }
  if (puts.length >= requiredAgreement) {
    const avgConf = puts.reduce((s, r) => s + r.confidence, 0) / puts.length;
    return {
      signal: 'PUT',
      confidence: Math.round(avgConf),
      agreement: puts.length,
      strategies: puts.map(r => `${r.name}(${r.confidence}%): ${r.reason}`),
      allResults: results
    };
  }

  return {
    signal: null,
    confidence: 0,
    agreement: 0,
    strategies: [],
    allResults: results
  };
}
