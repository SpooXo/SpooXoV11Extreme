/**
 * counter.js — günlük $0→$100 sayacı
 * state.js üzerine oturur; storage.js hazır olduğunda oraya da kaydeder.
 */

import { state } from '../core/state.js';

const STORAGE_KEY = 'spx_daily';
const DAILY_TARGET = 100;

/**
 * Sayacı başlat: localStorage'dan bugünün verisini yükle.
 * Eğer son kayıt bugünden değilse sıfırla.
 */
export function initCounter() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const today = todayKey();
      if (saved.date === today) {
        state.setState({
          dailyPnl:   saved.dailyPnl   ?? 0,
          tradeCount: saved.tradeCount ?? 0,
        });
        return;
      }
    }
  } catch (_) { /* bozuk veri — sıfırla */ }

  resetCounter();
}

/**
 * Tamamlanan işlemi kaydet.
 * @param {number} pnl - gerçekleşen net kar/zarar ($)
 */
export function recordTrade(pnl) {
  const newPnl   = parseFloat((state.get('dailyPnl') + pnl).toFixed(2));
  const newCount = state.get('tradeCount') + 1;

  state.setState({ dailyPnl: newPnl, tradeCount: newCount });
  persist();

  if (newPnl >= DAILY_TARGET) {
    state.emit('counter:target_reached', { dailyPnl: newPnl, tradeCount: newCount });
  }
}

/**
 * Günü sıfırla.
 */
export function resetCounter() {
  state.setState({ dailyPnl: 0, tradeCount: 0 });
  persist();
  state.emit('counter:reset');
}

/**
 * Progress bar için 0–1 arası değer döndür.
 */
export function getProgress() {
  return Math.min(state.get('dailyPnl') / DAILY_TARGET, 1);
}

/**
 * Hedefe ne kadar kaldı.
 */
export function getRemaining() {
  return Math.max(DAILY_TARGET - state.get('dailyPnl'), 0);
}

/**
 * Hedef tamamlandı mı?
 */
export function isTargetReached() {
  return state.get('dailyPnl') >= DAILY_TARGET;
}

// --- yardımcılar ---

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-03-31"
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      date:       todayKey(),
      dailyPnl:   state.get('dailyPnl'),
      tradeCount: state.get('tradeCount'),
    }));
  } catch (_) { /* storage dolu olabilir */ }
}
