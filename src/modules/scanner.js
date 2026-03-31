/**
 * scanner.js — 5 Gate değerlendirmesi
 *
 * Gate1: -0.05% < funding < +0.05%
 * Gate2: OI artıyor VE fiyat yönüyle uyumlu
 * Gate3: taker buy/sell oranı > 1.3 (son 3 mum)
 * Gate4: RSI 45-70 (long) veya 30-55 (short) ve momentum var
 * Gate5: son mum volume > 20 mum ortalaması × 1.5
 *
 * 5/5 → GİR | 4/5 → HAZIRLAN | ≤3/5 → GIRME
 */

import { getKlines, getOpenInterest, getFunding, COINS } from '../core/binance.js';
import { state } from '../core/state.js';

const RSI_PERIOD      = 14;
const VOLUME_MA_LEN   = 20;
const TAKER_LOOKBACK  = 3;   // son 3 mum
const TAKER_THRESHOLD = 1.3;
const VOLUME_MULT     = 1.5;
const FUNDING_LIMIT   = 0.0005; // %0.05

// OI önbelleği: { BTCUSDT: { value, time } }
const _oiCache = {};

// Tarayıcı çalışıyor mu?
let _scanning = false;
let _scanTimer = null;

/**
 * Tek bir coin için tüm gate'leri değerlendir.
 * @param {string} symbol
 * @param {'LONG'|'SHORT'} side
 * @returns {Promise<object>} setup sonucu
 */
export async function evaluateCoin(symbol, side) {
  // 25 mum yeter: 14 RSI + 1 son + 10 buffer
  const klines = await getKlines(symbol, '1m', 25);

  const [funding, oi] = await Promise.all([
    getFunding(symbol),
    getOpenInterest(symbol),
  ]);

  const closes  = klines.map(k => k.close);
  const current = closes.at(-1);
  const prev    = closes.at(-2);

  // --- Gate 1: Funding ---
  const g1 = Math.abs(funding) < FUNDING_LIMIT;

  // --- Gate 2: OI trend + fiyat yönü ---
  const oiPrev = _oiCache[symbol]?.value ?? oi;
  _oiCache[symbol] = { value: oi, time: Date.now() };

  const oiRising     = oi > oiPrev;
  const priceUp      = current > prev;
  const g2 = side === 'LONG'
    ? oiRising && priceUp
    : oiRising && !priceUp;

  // --- Gate 3: Taker buy/sell oranı (son 3 mum) ---
  const last3    = klines.slice(-TAKER_LOOKBACK);
  const buyVol   = last3.reduce((s, k) => s + k.takerBuyVolume, 0);
  const sellVol  = last3.reduce((s, k) => s + k.takerSellVolume, 0);
  const takerRatio = sellVol > 0 ? buyVol / sellVol : 0;
  const g3 = side === 'LONG'
    ? takerRatio > TAKER_THRESHOLD
    : (1 / Math.max(takerRatio, 0.001)) > TAKER_THRESHOLD; // short için ters oran

  // --- Gate 4: RSI + momentum ---
  const rsi      = calcRsi(closes, RSI_PERIOD);
  const momentum = closes.at(-1) > closes.at(-4); // 3 mumda yön
  const g4 = side === 'LONG'
    ? rsi >= 45 && rsi <= 70 && momentum
    : rsi >= 30 && rsi <= 55 && !momentum;

  // --- Gate 5: Volume spike ---
  const volumes  = klines.map(k => k.volume);
  const lastVol  = volumes.at(-1);
  const maVol    = avg(volumes.slice(-VOLUME_MA_LEN - 1, -1)); // son mum hariç 20 mum
  const g5       = lastVol > maVol * VOLUME_MULT;

  const gates     = [g1, g2, g3, g4, g5];
  const gateScore = gates.filter(Boolean).length;
  const signal    = gateScore === 5 ? 'GİR' : gateScore === 4 ? 'HAZIRLAN' : 'GIRME';

  return {
    coin:       symbol,
    side,
    signal,
    gateScore,
    gates: { g1, g2, g3, g4, g5 },
    funding:    round(funding * 100, 4),  // %
    oi:         round(oi, 2),
    takerRatio: round(takerRatio, 3),
    rsi:        round(rsi, 1),
    volume:     round(lastVol, 2),
    volumeMa:   round(maVol, 2),
    price:      current,
    ts:         Date.now(),
  };
}

/**
 * Tüm 30 coini tara, state.setups güncelle.
 * Her coin için hem LONG hem SHORT değerlendirilir,
 * en yüksek gateScore olan yön seçilir.
 */
export async function scanAll() {
  if (_scanning) return;
  _scanning = true;

  const results = [];

  // Paralel tarama (30 coin × 2 yön = 60 istek) → 5'erli batch'ler
  for (let i = 0; i < COINS.length; i += 5) {
    const batch = COINS.slice(i, i + 5);
    const settled = await Promise.allSettled(
      batch.flatMap(coin => [
        evaluateCoin(coin, 'LONG'),
        evaluateCoin(coin, 'SHORT'),
      ])
    );

    settled.forEach(r => {
      if (r.status === 'fulfilled') results.push(r.value);
    });
  }

  // Her coin için sadece en iyi yönü al
  const best = {};
  results.forEach(r => {
    const key = r.coin;
    if (!best[key] || r.gateScore > best[key].gateScore) {
      best[key] = r;
    }
  });

  // gateScore'a göre sırala
  const setups = Object.values(best).sort((a, b) => b.gateScore - a.gateScore);
  state.setState({ setups });

  _scanning = false;
  state.emit('scanner:done', { count: setups.length, ts: Date.now() });

  return setups;
}

/**
 * Belirli aralıklarla otomatik tarama başlat.
 * @param {number} intervalMs  varsayılan 60 saniye
 */
export function startScanner(intervalMs = 60_000) {
  stopScanner();
  scanAll(); // hemen bir kez çalıştır
  _scanTimer = setInterval(scanAll, intervalMs);
}

export function stopScanner() {
  if (_scanTimer) {
    clearInterval(_scanTimer);
    _scanTimer = null;
  }
}

// --- Hesaplama yardımcıları ---

/**
 * Wilder's RSI (standart RSI-14)
 */
function calcRsi(closes, period) {
  if (closes.length < period + 1) return 50; // veri yetersiz → nötr

  let gains = 0, losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains  += diff;
    else          losses -= diff;
  }

  let avgGain = gains  / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function round(val, decimals) {
  return parseFloat(val.toFixed(decimals));
}
