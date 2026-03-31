/**
 * calculator.js — TP/SL ve fee hesaplama
 *
 * Formül (CLAUDE.md'den):
 *   totalFee    = pozisyon × 0.001          (taker %0.05 × 2 yön)
 *   grossTarget = 1 + totalFee
 *   moveRatio   = grossTarget / (pozisyon × kaldıraç)
 *   LONG  TP    = giriş × (1 + moveRatio)
 *   SHORT TP    = giriş × (1 - moveRatio)
 *   SL          = TP mesafesi × 1.5         (RR 1:1.5)
 */

const TAKER_FEE_RATE = 0.0005; // %0.05

/**
 * @param {object} params
 * @param {number} params.entry      - Giriş fiyatı
 * @param {number} params.size       - Pozisyon büyüklüğü ($)
 * @param {number} params.leverage   - Kaldıraç (10–20)
 * @param {'LONG'|'SHORT'} params.side
 * @returns {{ tp, sl, totalFee, grossTarget, moveRatio, tpDistance, slDistance, riskReward }}
 */
export function calculate({ entry, size, leverage, side }) {
  if (!entry || entry <= 0) throw new Error('Geçersiz giriş fiyatı');
  if (!size || size < 100 || size > 300) throw new Error('Pozisyon $100–$300 aralığında olmalı');
  if (!leverage || leverage < 10 || leverage > 20) throw new Error('Kaldıraç 10x–20x aralığında olmalı');
  if (side !== 'LONG' && side !== 'SHORT') throw new Error('Yön LONG veya SHORT olmalı');

  const totalFee    = size * TAKER_FEE_RATE * 2;      // açış + kapanış
  const grossTarget = 1 + totalFee;                   // $1 net + fee
  const moveRatio   = grossTarget / (size * leverage);

  let tp, sl;
  if (side === 'LONG') {
    tp = entry * (1 + moveRatio);
    sl = entry * (1 - moveRatio * 1.5);
  } else {
    tp = entry * (1 - moveRatio);
    sl = entry * (1 + moveRatio * 1.5);
  }

  const tpDistance = Math.abs(tp - entry);
  const slDistance = Math.abs(sl - entry);
  const riskReward = tpDistance / slDistance; // ~0.667 (1:1.5)

  // Fiyat hassasiyeti: BTC gibi büyük coinler için daha fazla ondalık
  const precision = entry >= 1000 ? 2 : entry >= 1 ? 4 : 6;

  return {
    tp:          round(tp, precision),
    sl:          round(sl, precision),
    totalFee:    round(totalFee, 4),
    grossTarget: round(grossTarget, 4),
    moveRatio:   round(moveRatio, 6),
    tpDistance:  round(tpDistance, precision),
    slDistance:  round(slDistance, precision),
    riskReward:  round(riskReward, 3),
  };
}

/**
 * Birden fazla senaryo hesapla (farklı pozisyon büyüklükleri için)
 * @param {object} base - entry, leverage, side
 * @returns {Array} 100, 200, 300 $ için hesaplar
 */
export function calculateScenarios(base) {
  return [100, 200, 300].map(size => ({
    size,
    ...calculate({ ...base, size }),
  }));
}

/**
 * Mevcut fiyata göre pozisyonun gerçek zamanlı PnL'ini hesapla
 * @param {object} position - { side, entry, size, leverage }
 * @param {number} currentPrice
 * @returns {{ unrealizedPnl, unrealizedPnlPct, distanceToTp, distanceToSl }}
 */
export function calcLivePnl(position, currentPrice) {
  const { side, entry, size, leverage, tp, sl } = position;

  const priceDiff = side === 'LONG'
    ? currentPrice - entry
    : entry - currentPrice;

  const unrealizedPnl    = round((priceDiff / entry) * size * leverage, 2);
  const unrealizedPnlPct = round((priceDiff / entry) * leverage * 100, 2);
  const distanceToTp     = side === 'LONG' ? tp - currentPrice : currentPrice - tp;
  const distanceToSl     = side === 'LONG' ? currentPrice - sl : sl - currentPrice;

  return { unrealizedPnl, unrealizedPnlPct, distanceToTp, distanceToSl };
}

function round(val, decimals) {
  return parseFloat(val.toFixed(decimals));
}
