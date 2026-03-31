/**
 * binance.js — Binance Futures REST + WebSocket
 *
 * REST base : https://fapi.binance.com
 * WS  base  : wss://fstream.binance.com
 *
 * Public endpoint'ler kullanılır — API key gerektirmez.
 */

import { state } from './state.js';

const REST_BASE = 'https://fapi.binance.com';
const WS_BASE   = 'wss://fstream.binance.com';

const COINS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'DOGEUSDT','ADAUSDT','AVAXUSDT','LTCUSDT','LINKUSDT',
  'DOTUSDT','MATICUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
  'APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
  'SEIUSDT','TIAUSDT','WLDUSDT','FETUSDT','AGIXUSDT',
  'RNDRUSDT','TRBUSDT','ORDIUSDT','SATSUSDT','1000PEPEUSDT',
];

// --- REST yardımcıları ---

async function restGet(path, params = {}) {
  const url = new URL(REST_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Binance REST ${path} → ${res.status}`);
  return res.json();
}

/**
 * Tek coin için funding rate al.
 * @returns {number} funding rate (ör. 0.0001 = %0.01)
 */
export async function getFunding(symbol) {
  const data = await restGet('/fapi/v1/premiumIndex', { symbol });
  return parseFloat(data.lastFundingRate);
}

/**
 * Tek coin için open interest al.
 * @returns {number} openInterest (coin cinsinden)
 */
export async function getOpenInterest(symbol) {
  const data = await restGet('/fapi/v1/openInterest', { symbol });
  return parseFloat(data.openInterest);
}

/**
 * Kline (mum) verisi al.
 * Her mum: [openTime, open, high, low, close, volume,
 *           closeTime, quoteVolume, trades,
 *           takerBuyBaseVolume, takerBuyQuoteVolume, ignore]
 * @param {string} symbol
 * @param {string} interval  '1m' | '3m' | '5m' ...
 * @param {number} limit     mum sayısı
 * @returns {Array<object>}  normalize edilmiş mum array'i
 */
export async function getKlines(symbol, interval = '1m', limit = 25) {
  const raw = await restGet('/fapi/v1/klines', { symbol, interval, limit });
  return raw.map(k => ({
    openTime:           k[0],
    open:               parseFloat(k[1]),
    high:               parseFloat(k[2]),
    low:                parseFloat(k[3]),
    close:              parseFloat(k[4]),
    volume:             parseFloat(k[5]),
    closeTime:          k[6],
    takerBuyVolume:     parseFloat(k[9]),
    takerSellVolume:    parseFloat(k[5]) - parseFloat(k[9]),
  }));
}

/**
 * Tüm coinlerin fiyatlarını tek seferde çek (REST snapshot).
 * @returns {object} { BTCUSDT: 68420.5, ... }
 */
export async function getAllPrices() {
  const data = await restGet('/fapi/v1/ticker/price');
  const map = {};
  data.forEach(({ symbol, price }) => {
    if (COINS.includes(symbol)) map[symbol] = parseFloat(price);
  });
  return map;
}

// --- WebSocket ---

let _ws          = null;
let _reconnectTimer = null;
let _reconnectDelay = 2000;
const MAX_DELAY     = 30000;

/**
 * Tüm 30 coin için miniTicker stream'i aç.
 * Gelen fiyatlar state.updatePrice() ile işlenir.
 */
export function connectWs() {
  if (_ws && _ws.readyState === WebSocket.OPEN) return;

  _clearReconnect();

  // Combined stream: coin sayısı 30 → tek bağlantıda
  const streams = COINS.map(c => `${c.toLowerCase()}@miniTicker`).join('/');
  const url     = `${WS_BASE}/stream?streams=${streams}`;

  _ws = new WebSocket(url);

  _ws.onopen = () => {
    _reconnectDelay = 2000;
    state.setState({ connected: true });
    console.log('[binance] WS bağlandı');
  };

  _ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      // Combined stream payload: { stream: "btcusdt@miniTicker", data: {...} }
      const ticker = msg.data ?? msg;
      if (ticker.e === '24hrMiniTicker') {
        state.updatePrice(ticker.s, parseFloat(ticker.c)); // 'c' = close/last price
        state.setState({ lastUpdate: Date.now() });
      }
    } catch (_) {}
  };

  _ws.onerror = (e) => {
    console.warn('[binance] WS hata:', e.message ?? e);
  };

  _ws.onclose = () => {
    state.setState({ connected: false });
    console.warn(`[binance] WS kapandı, ${_reconnectDelay / 1000}s sonra yeniden bağlanılıyor`);
    _scheduleReconnect();
  };
}

export function disconnectWs() {
  _clearReconnect();
  if (_ws) {
    _ws.onclose = null; // otomatik reconnect engelle
    _ws.close();
    _ws = null;
  }
  state.setState({ connected: false });
}

function _scheduleReconnect() {
  _reconnectTimer = setTimeout(() => {
    connectWs();
    _reconnectDelay = Math.min(_reconnectDelay * 2, MAX_DELAY);
  }, _reconnectDelay);
}

function _clearReconnect() {
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer);
    _reconnectTimer = null;
  }
}

export { COINS };
