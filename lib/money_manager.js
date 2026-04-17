/**
 * Money Management Module
 * Supports Fixed, Fixed-%, Martingale, Anti-Martingale, and Kelly Criterion sizing.
 */

export class MoneyManager {
  constructor(config = {}) {
    this.mode          = config.mode || 'fixed_percent';  // 'fixed'|'fixed_percent'|'martingale'|'anti_martingale'|'kelly'
    this.baseAmount    = config.baseAmount || 1;
    this.basePercent   = config.basePercent || 1;         // % of balance
    this.martingaleMult = config.martingaleMult || 2.0;
    this.maxMartingale  = config.maxMartingale || 3;       // max Martingale levels
    this.maxTradePercent = config.maxTradePercent || 5;   // never risk >5% in one trade
    this.maxDailyLoss  = config.maxDailyLoss || 20;       // stop trading if daily drawdown % exceeds this

    this._consecutiveLosses = 0;
    this._consecutiveWins   = 0;
    this._dailyPnL          = 0;
    this._tradeHistory      = [];
    this._dayStart          = Date.now();
  }

  // Calculate trade size given current balance and last signal confidence
  getTradeAmount(balance, confidence = 70) {
    this._checkDayReset();
    const maxAllowed = balance * (this.maxTradePercent / 100);

    let amount;
    switch (this.mode) {
      case 'fixed':
        amount = this.baseAmount;
        break;

      case 'fixed_percent':
        // Scale up slightly with higher confidence
        const confMult = 1 + (Math.max(confidence - 65, 0) / 100);
        amount = balance * (this.basePercent / 100) * confMult;
        break;

      case 'martingale':
        // Double after each loss up to maxMartingale levels
        const level = Math.min(this._consecutiveLosses, this.maxMartingale);
        amount = this.baseAmount * Math.pow(this.martingaleMult, level);
        break;

      case 'anti_martingale':
        // Increase after wins, reset after loss
        const winLevel = Math.min(this._consecutiveWins, 3);
        amount = this._consecutiveLosses > 0
          ? this.baseAmount
          : this.baseAmount * Math.pow(1.5, winLevel);
        break;

      case 'kelly':
        // Kelly fraction: f = (p*(b+1)-1)/b where b = payout ratio
        const payout = 0.85; // Typical PO payout
        const winRate = this._estimatedWinRate();
        const kelly = (winRate * (payout + 1) - 1) / payout;
        const fraction = Math.max(0, Math.min(kelly * 0.5, 0.03)); // Half-Kelly, max 3%
        amount = balance * fraction;
        break;

      default:
        amount = this.baseAmount;
    }

    return Math.min(Math.max(amount, 1), maxAllowed);
  }

  recordResult(outcome, amount) {
    this._tradeHistory.push({ outcome, amount, time: Date.now() });
    if (outcome === 'win') {
      this._consecutiveLosses = 0;
      this._consecutiveWins++;
      this._dailyPnL += amount * 0.85;
    } else {
      this._consecutiveWins = 0;
      this._consecutiveLosses++;
      this._dailyPnL -= amount;
    }
  }

  isDailyLimitReached(balance) {
    const initialBalance = balance - this._dailyPnL;
    const drawdownPct = initialBalance > 0
      ? (-this._dailyPnL / initialBalance) * 100
      : 0;
    return drawdownPct >= this.maxDailyLoss;
  }

  getStats() {
    const total = this._tradeHistory.length;
    const wins  = this._tradeHistory.filter(t => t.outcome === 'win').length;
    return {
      total,
      wins,
      losses: total - wins,
      winRate: total > 0 ? ((wins / total) * 100).toFixed(1) : 0,
      dailyPnL: this._dailyPnL.toFixed(2),
      consecutiveLosses: this._consecutiveLosses,
      consecutiveWins: this._consecutiveWins
    };
  }

  _estimatedWinRate() {
    const recent = this._tradeHistory.slice(-30);
    if (recent.length < 10) return 0.55; // default assumption
    const wins = recent.filter(t => t.outcome === 'win').length;
    return wins / recent.length;
  }

  _checkDayReset() {
    const now = Date.now();
    if (now - this._dayStart > 86400000) {
      this._dailyPnL = 0;
      this._dayStart = now;
    }
  }
}
