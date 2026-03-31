/**
 * modal.js — setup detay modalı
 *
 * Bir setup seçildiğinde açılır:
 * - Gate breakdown (5 gate tick/cross)
 * - TP/SL hesaplama (3 pozisyon boyutu)
 * - Giriş butonu (pozisyon açar, state günceller)
 *
 * innerHTML kullanan hiçbir event listener yok.
 * Tüm DOM elemanları createElement + addEventListener ile oluşturulur.
 */

import { calculate }    from '../modules/calculator.js';
import { state }        from '../core/state.js';
import { startTracking } from '../modules/tracker.js';

const C = {
  bg:     '#060a0f',
  panel:  '#0d1520',
  border: '#1a2535',
  green:  '#00ff88',
  red:    '#ff4466',
  yellow: '#ffd000',
  blue:   '#40c4ff',
  purple: '#c87fff',
  text:   '#e0e8f0',
  muted:  '#4a6080',
};

let _overlay = null;
let _currentSetup = null;

/**
 * Modalı aç.
 * @param {object} setup  scanner.js'den gelen setup objesi
 */
export function openModal(setup) {
  closeModal();
  _currentSetup = setup;

  _overlay = _buildOverlay(setup);
  document.body.appendChild(_overlay);

  // ESC ile kapat
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey, { once: true });
  _overlay._onKey = onKey;

  // Arka plana tıkla → kapat
  _overlay.addEventListener('click', (e) => {
    if (e.target === _overlay) closeModal();
  });
}

export function closeModal() {
  if (!_overlay) return;
  if (_overlay._onKey) document.removeEventListener('keydown', _overlay._onKey);
  _overlay.remove();
  _overlay = null;
  _currentSetup = null;
}

// --- DOM builder ---

function _buildOverlay(setup) {
  const overlay = el('div', {
    position: 'fixed', inset: '0',
    background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'flex-end',
    zIndex: '1000',
  });

  const panel = el('div', {
    background: C.panel,
    borderTop: `1px solid ${C.border}`,
    borderRadius: '16px 16px 0 0',
    width: '100%',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '20px 16px 32px',
    fontFamily: "'DM Sans', sans-serif",
    color: C.text,
  });

  // Başlık
  panel.appendChild(_buildHeader(setup));

  // Gate breakdown
  panel.appendChild(_buildGates(setup));

  // Hesap tablosu (3 boyut)
  panel.appendChild(_buildCalcTable(setup));

  // Giriş butonu
  panel.appendChild(_buildEntrySection(setup));

  overlay.appendChild(panel);
  return overlay;
}

function _buildHeader(setup) {
  const wrap = el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' });

  const left = el('div');

  const coinEl = el('div', {
    fontFamily: "'Space Mono', monospace",
    fontSize: '20px',
    fontWeight: '700',
    color: setup.side === 'LONG' ? C.green : C.red,
  });
  coinEl.textContent = `${setup.coin} ${setup.side}`;

  const metaEl = el('div', { fontSize: '12px', color: C.muted, marginTop: '4px' });
  metaEl.textContent = `RSI ${setup.rsi} · Funding ${setup.funding}% · Taker ${setup.takerRatio}`;

  left.appendChild(coinEl);
  left.appendChild(metaEl);

  const closeBtn = el('button', {
    background: 'none', border: 'none', color: C.muted,
    fontSize: '24px', cursor: 'pointer', padding: '4px 8px',
  });
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeModal);

  wrap.appendChild(left);
  wrap.appendChild(closeBtn);
  return wrap;
}

function _buildGates(setup) {
  const section = el('div', { marginBottom: '16px' });

  const title = el('div', { fontSize: '11px', color: C.muted, letterSpacing: '1px', marginBottom: '8px' });
  title.textContent = 'GATE ANALIZI';
  section.appendChild(title);

  const grid = el('div', { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' });

  const labels = [
    'G1 Funding',
    'G2 OI Yönü',
    'G3 Taker Oranı',
    'G4 RSI + Momentum',
    'G5 Volume Spike',
  ];

  labels.forEach((label, i) => {
    const passed = setup.gates[`g${i + 1}`];
    const row = el('div', {
      display: 'flex', alignItems: 'center', gap: '8px',
      background: '#111d2b', borderRadius: '8px', padding: '8px 10px',
      border: `1px solid ${passed ? C.green + '33' : C.border}`,
    });

    const icon = el('span', { fontSize: '14px' });
    icon.textContent = passed ? '✓' : '✗';
    icon.style.color = passed ? C.green : C.red;

    const txt = el('span', { fontSize: '12px', color: passed ? C.text : C.muted });
    txt.textContent = label;

    row.appendChild(icon);
    row.appendChild(txt);
    grid.appendChild(row);
  });

  // Score badge
  const score = el('div', {
    gridColumn: '1 / -1',
    textAlign: 'center',
    padding: '8px',
    borderRadius: '8px',
    fontFamily: "'Space Mono', monospace",
    fontWeight: '700',
    fontSize: '13px',
    background: _scoreBg(setup.gateScore),
    color: _scoreColor(setup.gateScore),
  });
  score.textContent = `${setup.gateScore}/5 — ${setup.signal}`;
  grid.appendChild(score);

  section.appendChild(grid);
  return section;
}

function _buildCalcTable(setup) {
  const section = el('div', { marginBottom: '20px' });

  const title = el('div', { fontSize: '11px', color: C.muted, letterSpacing: '1px', marginBottom: '8px' });
  title.textContent = 'TP / SL HESABI';
  section.appendChild(title);

  const price = state.get('prices')[setup.coin] ?? setup.price;

  [100, 200, 300].forEach(size => {
    try {
      const calc = calculate({ entry: price, size, leverage: 10, side: setup.side });
      const row = el('div', {
        display: 'grid',
        gridTemplateColumns: '60px 1fr 1fr 1fr',
        gap: '8px',
        alignItems: 'center',
        padding: '10px',
        background: '#111d2b',
        borderRadius: '8px',
        marginBottom: '6px',
        fontFamily: "'Space Mono', monospace",
        fontSize: '12px',
      });

      const sizeEl = el('span', { color: C.yellow, fontWeight: '700' });
      sizeEl.textContent = `$${size}`;

      const tpEl = el('span', { color: C.green });
      tpEl.textContent = `TP\n${_fmt(calc.tp)}`;
      tpEl.style.whiteSpace = 'pre';

      const slEl = el('span', { color: C.red });
      slEl.textContent = `SL\n${_fmt(calc.sl)}`;
      slEl.style.whiteSpace = 'pre';

      const feeEl = el('span', { color: C.muted, fontSize: '11px' });
      feeEl.textContent = `fee\n$${calc.totalFee.toFixed(3)}`;
      feeEl.style.whiteSpace = 'pre';

      row.appendChild(sizeEl);
      row.appendChild(tpEl);
      row.appendChild(slEl);
      row.appendChild(feeEl);
      section.appendChild(row);
    } catch (_) {}
  });

  return section;
}

function _buildEntrySection(setup) {
  const section = el('div');

  // Pozisyon boyutu seçici
  const sizeLabel = el('div', { fontSize: '11px', color: C.muted, letterSpacing: '1px', marginBottom: '8px' });
  sizeLabel.textContent = 'POZİSYON BOYUTU';
  section.appendChild(sizeLabel);

  const sizeRow = el('div', { display: 'flex', gap: '8px', marginBottom: '16px' });
  let selectedSize = 100;

  const sizeBtns = [100, 200, 300].map(s => {
    const btn = el('button', {
      flex: '1', padding: '10px', borderRadius: '8px',
      fontFamily: "'Space Mono', monospace", fontSize: '13px', fontWeight: '700',
      cursor: 'pointer', transition: 'all 0.15s',
      border: `1px solid ${C.border}`,
      background: s === 100 ? C.blue + '22' : 'transparent',
      color: s === 100 ? C.blue : C.muted,
    });
    btn.textContent = `$${s}`;
    btn.addEventListener('click', () => {
      selectedSize = s;
      sizeBtns.forEach((b, i) => {
        const active = [100, 200, 300][i] === s;
        b.style.background = active ? C.blue + '22' : 'transparent';
        b.style.color       = active ? C.blue : C.muted;
        b.style.borderColor = active ? C.blue : C.border;
      });
    });
    sizeRow.appendChild(btn);
    return btn;
  });
  section.appendChild(sizeRow);

  // Giriş butonu
  const entryBtn = el('button', {
    width: '100%', padding: '16px',
    borderRadius: '12px', border: 'none',
    fontFamily: "'Space Mono', monospace", fontSize: '15px', fontWeight: '700',
    cursor: 'pointer',
    background: setup.side === 'LONG' ? C.green : C.red,
    color: '#000',
    letterSpacing: '1px',
  });
  entryBtn.textContent = `${setup.side === 'LONG' ? '▲' : '▼'} GİRİŞ YAP — ${setup.coin}`;

  entryBtn.addEventListener('click', () => {
    const entry = state.get('prices')[setup.coin] ?? setup.price;
    const calc  = calculate({ entry, size: selectedSize, leverage: 10, side: setup.side });

    state.openPosition({
      coin:     setup.coin,
      side:     setup.side,
      entry,
      size:     selectedSize,
      leverage: 10,
      tp:       calc.tp,
      sl:       calc.sl,
    });

    startTracking();
    closeModal();
  });

  section.appendChild(entryBtn);
  return section;
}

// --- yardımcılar ---

function el(tag, styles = {}) {
  const node = document.createElement(tag);
  Object.assign(node.style, styles);
  return node;
}

function _fmt(price) {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1)    return price.toFixed(4);
  return price.toFixed(6);
}

function _scoreBg(score) {
  if (score === 5) return C.green + '22';
  if (score === 4) return C.yellow + '22';
  return C.red + '11';
}

function _scoreColor(score) {
  if (score === 5) return C.green;
  if (score === 4) return C.yellow;
  return C.red;
}
