/**
 * Technical Analysis Indicators
 * All functions accept arrays of closing prices (most recent LAST)
 * Returns NaN when insufficient data is available
 */

export function ema(prices, period) {
  if (prices.length < period) return NaN;
  const k = 2 / (period + 1);
  let emaVal = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    emaVal = prices[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

export function emaArray(prices, period) {
  const result = new Array(prices.length).fill(NaN);
  if (prices.length < period) return result;
  const k = 2 / (period + 1);
  let val = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = val;
  for (let i = period; i < prices.length; i++) {
    val = prices[i] * k + val * (1 - k);
    result[i] = val;
  }
  return result;
}

export function rsi(prices, period = 14) {
  if (prices.length < period + 1) return NaN;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function macd(prices, fast = 12, slow = 26, signal = 9) {
  if (prices.length < slow + signal) return { macd: NaN, signal: NaN, histogram: NaN };
  const fastEma = emaArray(prices, fast);
  const slowEma = emaArray(prices, slow);
  const macdLine = fastEma.map((v, i) => (isNaN(v) || isNaN(slowEma[i])) ? NaN : v - slowEma[i]);
  const validMacd = macdLine.filter(v => !isNaN(v));
  if (validMacd.length < signal) return { macd: NaN, signal: NaN, histogram: NaN };
  const signalLine = ema(validMacd, signal);
  const lastMacd = macdLine[macdLine.length - 1];
  return {
    macd: lastMacd,
    signal: signalLine,
    histogram: isNaN(lastMacd) || isNaN(signalLine) ? NaN : lastMacd - signalLine
  };
}

export function bollingerBands(prices, period = 20, stdDevMult = 2) {
  if (prices.length < period) return { upper: NaN, middle: NaN, lower: NaN };
  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: middle + stdDevMult * stdDev,
    middle,
    lower: middle - stdDevMult * stdDev,
    bandwidth: (stdDevMult * 2 * stdDev) / middle
  };
}

export function stochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
  if (closes.length < kPeriod) return { k: NaN, d: NaN };
  const kValues = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const sliceH = highs.slice(i - kPeriod + 1, i + 1);
    const sliceL = lows.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...sliceH);
    const lowest = Math.min(...sliceL);
    const range = highest - lowest;
    kValues.push(range === 0 ? 50 : ((closes[i] - lowest) / range) * 100);
  }
  const k = kValues[kValues.length - 1];
  const d = kValues.length >= dPeriod
    ? kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod
    : NaN;
  return { k, d };
}

export function atr(highs, lows, closes, period = 14) {
  if (closes.length < period + 1) return NaN;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  if (trs.length < period) return NaN;
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

export function sma(prices, period) {
  if (prices.length < period) return NaN;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// Detect candlestick reversal patterns — returns 'bullish', 'bearish', or null
export function candlePattern(candles) {
  if (candles.length < 3) return null;
  const [prev2, prev1, curr] = candles.slice(-3);
  const body = c => Math.abs(c.close - c.open);
  const range = c => c.high - c.low;
  const upperWick = c => c.high - Math.max(c.open, c.close);
  const lowerWick = c => Math.min(c.open, c.close) - c.low;
  const isBullish = c => c.close > c.open;
  const isBearish = c => c.close < c.open;

  // Hammer: small body at top, long lower wick (bullish reversal after downtrend)
  if (isBearish(prev1) && lowerWick(curr) > body(curr) * 2 && upperWick(curr) < body(curr) * 0.5) {
    return 'bullish';
  }
  // Shooting star: small body at bottom, long upper wick (bearish reversal after uptrend)
  if (isBullish(prev1) && upperWick(curr) > body(curr) * 2 && lowerWick(curr) < body(curr) * 0.5) {
    return 'bearish';
  }
  // Bullish engulfing
  if (isBearish(prev1) && isBullish(curr) && curr.open < prev1.close && curr.close > prev1.open) {
    return 'bullish';
  }
  // Bearish engulfing
  if (isBullish(prev1) && isBearish(curr) && curr.open > prev1.close && curr.close < prev1.open) {
    return 'bearish';
  }
  // Doji (indecision at extreme)
  if (body(curr) < range(curr) * 0.1 && range(curr) > 0) {
    const trend = prev1.close - prev2.close;
    return trend > 0 ? 'bearish' : 'bullish';
  }
  return null;
}

// Detect support/resistance levels from recent candles
export function getSupportResistance(candles, lookback = 50, tolerance = 0.0003) {
  const levels = [];
  const subset = candles.slice(-lookback);
  for (let i = 2; i < subset.length - 2; i++) {
    const c = subset[i];
    // Local high (resistance)
    if (c.high > subset[i - 1].high && c.high > subset[i - 2].high &&
        c.high > subset[i + 1].high && c.high > subset[i + 2].high) {
      levels.push({ price: c.high, type: 'resistance', strength: 1 });
    }
    // Local low (support)
    if (c.low < subset[i - 1].low && c.low < subset[i - 2].low &&
        c.low < subset[i + 1].low && c.low < subset[i + 2].low) {
      levels.push({ price: c.low, type: 'support', strength: 1 });
    }
  }
  // Merge nearby levels
  const merged = [];
  for (const lvl of levels) {
    const existing = merged.find(m => Math.abs(m.price - lvl.price) / lvl.price < tolerance);
    if (existing) { existing.strength++; existing.price = (existing.price + lvl.price) / 2; }
    else merged.push({ ...lvl });
  }
  return merged.filter(l => l.strength >= 2).sort((a, b) => b.strength - a.strength);
}
