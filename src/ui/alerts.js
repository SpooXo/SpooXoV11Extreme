/**
 * alerts.js — ses + titreşim bildirimleri
 * Web Audio API (AudioContext) kullanır. Kullanıcı etkileşimi olmadan
 * tarayıcı ses çalmaz; ilk dokunuşta AudioContext resume() çağrılır.
 */

let _ctx = null;

function getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Tarayıcı politikası: ilk etkileşimden önce suspended olabilir
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

/**
 * Temel bip sesi
 * @param {object} opts
 * @param {number} opts.freq      - Frekans Hz (varsayılan 880)
 * @param {number} opts.duration  - Süre ms (varsayılan 120)
 * @param {number} opts.volume    - 0–1 (varsayılan 0.4)
 * @param {'sine'|'square'|'sawtooth'|'triangle'} opts.type
 */
function beep({ freq = 880, duration = 120, volume = 0.4, type = 'sine' } = {}) {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration / 1000);
  } catch (e) {
    console.warn('[alerts] Ses çalınamadı:', e.message);
  }
}

/**
 * Titreşim (Android PWA)
 * @param {number|number[]} pattern - ms veya dizi [titreşim, duraklama, ...]
 */
function vibrate(pattern = 100) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

// --- Önceden tanımlı uyarı tipleri ---

/**
 * GİR sinyali: yüksek çift bip + uzun titreşim
 */
export function alertEntry() {
  beep({ freq: 1047, duration: 100, volume: 0.5 }); // C6
  setTimeout(() => beep({ freq: 1319, duration: 150, volume: 0.6 }), 130); // E6
  vibrate([100, 50, 200]);
}

/**
 * HAZIRLAN sinyali: tek orta bip + kısa titreşim
 */
export function alertReady() {
  beep({ freq: 659, duration: 120, volume: 0.35 }); // E5
  vibrate(80);
}

/**
 * TP vurdu: üçlü yükselen bip + sevinç titreşimi
 */
export function alertTpHit() {
  beep({ freq: 880,  duration: 80,  volume: 0.5 });
  setTimeout(() => beep({ freq: 1047, duration: 80,  volume: 0.55 }), 100);
  setTimeout(() => beep({ freq: 1319, duration: 120, volume: 0.6  }), 200);
  vibrate([80, 40, 80, 40, 200]);
}

/**
 * SL vurdu: alçalan çift bip + uyarı titreşimi
 */
export function alertSlHit() {
  beep({ freq: 440, duration: 150, volume: 0.5, type: 'square' });
  setTimeout(() => beep({ freq: 330, duration: 200, volume: 0.45, type: 'square' }), 170);
  vibrate([200, 100, 200]);
}

/**
 * Günlük hedef $100 ulaşıldı: fanfare
 */
export function alertTargetReached() {
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    setTimeout(() => beep({ freq, duration: 150, volume: 0.6 }), i * 160);
  });
  vibrate([100, 50, 100, 50, 100, 50, 400]);
}

/**
 * Bağlantı kesildi: düşük tek bip
 */
export function alertDisconnected() {
  beep({ freq: 220, duration: 300, volume: 0.3, type: 'sawtooth' });
  vibrate(50);
}

/**
 * Ses sistemini kullanıcı etkileşimiyle başlat.
 * index.html'deki ilk butona veya document'e bağlanmalı.
 */
export function initAudio() {
  const resume = () => {
    getCtx();
    document.removeEventListener('touchstart', resume);
    document.removeEventListener('click', resume);
  };
  document.addEventListener('touchstart', resume, { once: true });
  document.addEventListener('click', resume, { once: true });
}
