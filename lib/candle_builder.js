/**
 * Builds OHLCV candles from raw tick data received via WebSocket.
 * Supports multiple timeframes simultaneously.
 */

export class CandleBuilder {
  constructor(periodSeconds = 60) {
    this.period = periodSeconds * 1000; // ms
    this.candles = [];        // completed candles
    this.currentCandle = null;
    this.onCandleClose = null; // callback when candle closes
  }

  addTick(price, timestamp) {
    const ts = typeof timestamp === 'number' ? timestamp : Date.now();
    const candleStart = Math.floor(ts / this.period) * this.period;

    if (!this.currentCandle || this.currentCandle.time !== candleStart) {
      if (this.currentCandle) {
        this.candles.push({ ...this.currentCandle });
        if (this.candles.length > 500) this.candles.shift(); // keep last 500
        if (this.onCandleClose) this.onCandleClose(this.currentCandle);
      }
      this.currentCandle = {
        time:  candleStart,
        open:  price,
        high:  price,
        low:   price,
        close: price,
        ticks: 1
      };
    } else {
      this.currentCandle.high  = Math.max(this.currentCandle.high, price);
      this.currentCandle.low   = Math.min(this.currentCandle.low, price);
      this.currentCandle.close = price;
      this.currentCandle.ticks++;
    }
  }

  // Return all completed candles + current partial candle
  getAllCandles() {
    const all = [...this.candles];
    if (this.currentCandle) all.push({ ...this.currentCandle });
    return all;
  }

  getCompletedCandles() {
    return [...this.candles];
  }

  getLastN(n) {
    const all = this.getAllCandles();
    return all.slice(-n);
  }

  reset() {
    this.candles = [];
    this.currentCandle = null;
  }
}

// Multi-timeframe manager
export class MultiTimeframeCandleBuilder {
  constructor(periodsSeconds = [60, 300]) {
    this.builders = {};
    for (const p of periodsSeconds) {
      this.builders[p] = new CandleBuilder(p);
    }
  }

  addTick(price, timestamp) {
    for (const builder of Object.values(this.builders)) {
      builder.addTick(price, timestamp);
    }
  }

  getCandles(periodSeconds) {
    return this.builders[periodSeconds]?.getAllCandles() || [];
  }

  setOnCandleClose(periodSeconds, callback) {
    if (this.builders[periodSeconds]) {
      this.builders[periodSeconds].onCandleClose = callback;
    }
  }
}
