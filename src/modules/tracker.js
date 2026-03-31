/**
 * tracker.js — aktif pozisyon takibi
 *
 * - Fiyat güncellemelerini dinler, TP/SL kontrolü yapar
 * - TP/SL vurduğunda alert + state günceller
 * - Pozisyon süresi aşılırsa uyarı verir (>10 dk)
 */

import { state }                          from '../core/state.js';
import { recordTrade }                    from './counter.js';
import { calcLivePnl }                    from './calculator.js';
import { alertTpHit, alertSlHit }         from '../ui/alerts.js';

const MAX_DURATION_MS = 10 * 60 * 1000; // 10 dakika

let _unsubPrice   = null;
let _durationTimer = null;

/**
 * Pozisyon takibini başlat.
 * openPosition() ile açılan pozisyonu otomatik izler.
 */
export function startTracking() {
  stopTracking();

  _unsubPrice = state.on('price', ({ coin, price }) => {
    const pos = state.get('position');
    if (!pos || pos.coin !== coin) return;

    const { unrealizedPnl, distanceToTp, distanceToSl } = calcLivePnl(pos, price);

    // State'i güncelle (unrealizedPnl zaten state.updatePrice içinde de işleniyor,
    // burada distanceToTp/Sl eklemek için tekrar yazıyoruz)
    state.setState({
      position: {
        ...pos,
        currentPrice:  price,
        unrealizedPnl,
        distanceToTp,
        distanceToSl,
      },
    });

    // TP kontrolü
    if (pos.side === 'LONG'  && price >= pos.tp) _handleTp(pos, price);
    if (pos.side === 'SHORT' && price <= pos.tp) _handleTp(pos, price);

    // SL kontrolü
    if (pos.side === 'LONG'  && price <= pos.sl) _handleSl(pos, price);
    if (pos.side === 'SHORT' && price >= pos.sl) _handleSl(pos, price);
  });

  // Süre uyarısı
  _durationTimer = setTimeout(() => {
    const pos = state.get('position');
    if (pos) state.emit('position:overtime', pos);
  }, MAX_DURATION_MS);
}

export function stopTracking() {
  if (_unsubPrice)   { _unsubPrice();    _unsubPrice   = null; }
  if (_durationTimer){ clearTimeout(_durationTimer); _durationTimer = null; }
}

/**
 * Pozisyon manuel kapat (kullanıcı butona bastı).
 * @param {number} exitPrice
 */
export function closeManually(exitPrice) {
  const pos = state.get('position');
  if (!pos) return;

  const { unrealizedPnl } = calcLivePnl(pos, exitPrice);
  _close(pos, exitPrice, unrealizedPnl, 'manual');
}

// --- iç yardımcılar ---

function _handleTp(pos, price) {
  alertTpHit();
  const { unrealizedPnl } = calcLivePnl(pos, price);
  _close(pos, price, unrealizedPnl, 'tp');
}

function _handleSl(pos, price) {
  alertSlHit();
  const { unrealizedPnl } = calcLivePnl(pos, price);
  _close(pos, price, unrealizedPnl, 'sl');
}

function _close(pos, exitPrice, pnl, reason) {
  stopTracking();
  recordTrade(pnl);
  state.setState({ position: null });
  state.emit('position:closed', {
    ...pos,
    exitPrice,
    pnl,
    reason,
    duration: Date.now() - pos.openTime,
  });
}
