/**
 * state.js — merkezi uygulama state'i
 * EventEmitter tabanlı. Global değişken yok, sadece setState() kullanılır.
 */

class EventEmitter {
  constructor() {
    this._listeners = {};
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }

  emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
    (this._listeners['*'] || []).forEach(fn => fn(event, data));
  }
}

const INITIAL_STATE = {
  // Günlük sayaç
  dailyPnl: 0,           // $ toplam günlük kar
  dailyTarget: 100,      // $ hedef
  tradeCount: 0,         // işlem sayısı

  // Aktif pozisyon (null = yok)
  position: null,
  // position shape:
  // { coin, side, entry, size, leverage, tp, sl, openTime, unrealizedPnl }

  // Scanner sonuçları
  setups: [],
  // setup shape:
  // { coin, side, gateScore, gates, funding, oi, takerRatio, rsi, volume }

  // Fiyat önbelleği
  prices: {},            // { BTCUSDT: 68420.5, ... }

  // Uygulama durumu
  connected: false,
  lastUpdate: null,
};

class AppState extends EventEmitter {
  constructor() {
    super();
    this._state = { ...INITIAL_STATE };
  }

  get(key) {
    return key ? this._state[key] : { ...this._state };
  }

  setState(patch) {
    const prev = { ...this._state };
    this._state = { ...this._state, ...patch };

    // Değişen her key için ayrı event fırlat
    Object.keys(patch).forEach(key => {
      if (prev[key] !== this._state[key]) {
        this.emit(`change:${key}`, this._state[key]);
      }
    });

    this.emit('change', { prev, next: { ...this._state }, patch });
  }

  // Pozisyon aç
  openPosition(positionData) {
    this.setState({
      position: {
        ...positionData,
        openTime: Date.now(),
        unrealizedPnl: 0,
      },
    });
  }

  // Pozisyon kapat
  closePosition(realizedPnl) {
    const prev = this._state.position;
    this.setState({
      position: null,
      dailyPnl: parseFloat((this._state.dailyPnl + realizedPnl).toFixed(2)),
      tradeCount: this._state.tradeCount + 1,
    });
    this.emit('trade:closed', { position: prev, pnl: realizedPnl });
  }

  // Fiyat güncelle (tek coin)
  updatePrice(coin, price) {
    const prices = { ...this._state.prices, [coin]: price };
    this._state.prices = prices; // emit tetiklemeden sessiz güncelle
    this.emit('price', { coin, price });

    // Açık pozisyonun unrealizedPnl'ini güncelle
    const pos = this._state.position;
    if (pos && pos.coin === coin) {
      const priceDiff = pos.side === 'LONG'
        ? price - pos.entry
        : pos.entry - price;
      const unrealizedPnl = parseFloat(
        ((priceDiff / pos.entry) * pos.size * pos.leverage).toFixed(2)
      );
      this._state.position = { ...pos, unrealizedPnl, currentPrice: price };
      this.emit('change:position', this._state.position);
    }
  }

  // Günü sıfırla
  resetDay() {
    this.setState({
      dailyPnl: 0,
      tradeCount: 0,
      setups: [],
    });
    this.emit('day:reset');
  }
}

export const state = new AppState();
