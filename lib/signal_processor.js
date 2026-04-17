/**
 * Signal Processor
 * Receives candle data, runs strategies, filters signals, enforces cooldowns.
 */

import { aggregateSignals } from './strategies.js';

export class SignalProcessor {
  constructor(config = {}) {
    this.minConfidence     = config.minConfidence || 65;
    this.requiredAgreement = config.requiredAgreement || 2;
    this.cooldownMs        = config.cooldownMs || 60000;  // 1 min between trades
    this.maxTradesPerHour  = config.maxTradesPerHour || 10;
    this.onSignal          = null; // callback(signal)

    this._lastTradeTime = 0;
    this._tradeTimestamps = [];
    this._lastSignalResult = null;
  }

  // Process candles and maybe emit a signal
  process(candles, asset) {
    if (candles.length < 30) return null;

    // Cooldown check
    const now = Date.now();
    if (now - this._lastTradeTime < this.cooldownMs) return null;

    // Hourly trade limit
    this._tradeTimestamps = this._tradeTimestamps.filter(t => now - t < 3600000);
    if (this._tradeTimestamps.length >= this.maxTradesPerHour) return null;

    const result = aggregateSignals(candles, this.minConfidence, this.requiredAgreement);

    if (result.signal) {
      this._lastTradeTime = now;
      this._tradeTimestamps.push(now);
      const signal = {
        ...result,
        asset,
        timestamp: now,
        candleCount: candles.length,
        lastPrice: candles[candles.length - 1].close
      };
      this._lastSignalResult = signal;
      if (this.onSignal) this.onSignal(signal);
      return signal;
    }
    return null;
  }

  getLastSignal() { return this._lastSignalResult; }

  reset() {
    this._lastTradeTime = 0;
    this._tradeTimestamps = [];
    this._lastSignalResult = null;
  }
}
