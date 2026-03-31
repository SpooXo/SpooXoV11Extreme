/**
 * dashboard.js — ana ekran
 *
 * Layout (her zaman görünür):
 *   1. Header: bağlantı durumu + günlük sayaç progress bar
 *   2. Pozisyon kartı: gerçek zamanlı P&L (yoksa gizli)
 *   3. Setup listesi: GİR / HAZIRLAN / GIRME
 *
 * Renk: bg #060a0f | green #00ff88 | red #ff4466 | yellow #ffd000 | blue #40c4ff | purple #c87fff
 * Font: Space Mono (sayılar) + DM Sans (metin)
 *
 * innerHTML kullanılmaz. Event listener'lar her zaman node referansına bağlıdır.
 */

import { state }       from '../core/state.js';
import { openModal }   from './modal.js';
import { closeManually } from '../modules/tracker.js';
import { getProgress, getRemaining } from '../modules/counter.js';

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

// Canlı güncelleme referansları
let _posCard   = null;
let _progress  = null;
let _setupList = null;
let _unsubs    = [];

/**
 * Dashboard'ı verilen container'a mount et.
 * @param {HTMLElement} root
 */
export function mount(root) {
  root.style.cssText = `
    background:${C.bg}; min-height:100vh; color:${C.text};
    font-family:'DM Sans',sans-serif; max-width:480px; margin:0 auto;
    padding:0 0 80px; overscroll-behavior:contain;
  `;

  root.appendChild(_buildHeader());
  root.appendChild(_buildPositionCard());
  root.appendChild(_buildSetupSection());

  _subscribeState();
}

export function unmount() {
  _unsubs.forEach(u => u());
  _unsubs = [];
}

// --- Bölümler ---

function _buildHeader() {
  const header = _el('div', `padding:16px; position:sticky; top:0; z-index:10;
    background:${C.bg}; border-bottom:1px solid ${C.border};`);

  // Üst satır: logo + bağlantı
  const topRow = _el('div', 'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;');

  const logo = _el('div', `font-family:'Space Mono',monospace; font-size:14px; color:${C.purple}; letter-spacing:1px;`);
  logo.textContent = 'SpooXo V11';

  const connDot = _el('div', `width:8px; height:8px; border-radius:50%;
    background:${state.get('connected') ? C.green : C.red};
    box-shadow:0 0 6px ${state.get('connected') ? C.green : C.red};`);

  const connWrap = _el('div', 'display:flex; align-items:center; gap:6px;');
  const connTxt  = _el('span', `font-size:11px; color:${C.muted};`);
  connTxt.textContent = state.get('connected') ? 'CANLI' : 'BAĞLANIYOR';
  connWrap.appendChild(connDot);
  connWrap.appendChild(connTxt);

  // Bağlantı durumu aboneliği
  _unsubs.push(state.on('change:connected', val => {
    connDot.style.background   = val ? C.green : C.red;
    connDot.style.boxShadow    = `0 0 6px ${val ? C.green : C.red}`;
    connTxt.textContent        = val ? 'CANLI' : 'BAĞLANIYOR';
  }));

  topRow.appendChild(logo);
  topRow.appendChild(connWrap);
  header.appendChild(topRow);

  // Progress bar
  const pbWrap = _el('div', `background:${C.border}; border-radius:4px; height:6px; overflow:hidden;`);
  const pbFill = _el('div', `height:100%; border-radius:4px;
    background:linear-gradient(90deg,${C.green},${C.blue});
    transition:width 0.4s ease; width:${getProgress() * 100}%;`);
  pbWrap.appendChild(pbFill);
  _progress = pbFill;

  // Sayaç metni
  const pbRow = _el('div', 'display:flex; justify-content:space-between; margin-bottom:6px;');
  const pbLeft = _el('span', `font-family:'Space Mono',monospace; font-size:12px; color:${C.green};`);
  const pbRight = _el('span', `font-size:11px; color:${C.muted};`);

  const _updateCounter = () => {
    const pnl  = state.get('dailyPnl');
    const cnt  = state.get('tradeCount');
    pbLeft.textContent  = `$${pnl.toFixed(2)} / $100`;
    pbRight.textContent = `${cnt} işlem · $${getRemaining().toFixed(2)} kaldı`;
    pbFill.style.width  = `${getProgress() * 100}%`;
  };
  _updateCounter();

  _unsubs.push(state.on('change:dailyPnl',   _updateCounter));
  _unsubs.push(state.on('change:tradeCount', _updateCounter));

  pbRow.appendChild(pbLeft);
  pbRow.appendChild(pbRight);
  header.appendChild(pbRow);
  header.appendChild(pbWrap);

  return header;
}

function _buildPositionCard() {
  const card = _el('div', `margin:12px; border-radius:12px;
    background:${C.panel}; border:1px solid ${C.border};
    padding:14px; display:none;`);
  _posCard = card;

  // İç elemanlar (referans için)
  const coinLine = _el('div', `font-family:'Space Mono',monospace; font-size:13px; font-weight:700;`);
  const pnlLine  = _el('div', `font-family:'Space Mono',monospace; font-size:28px; font-weight:700; margin:6px 0;`);
  const tpLine   = _el('div', `font-size:12px;`);
  const timerLine = _el('div', `font-size:11px; color:${C.muted}; margin-top:4px;`);

  const closeBtn = _el('button', `margin-top:12px; width:100%; padding:10px;
    border-radius:8px; border:1px solid ${C.border};
    background:transparent; color:${C.muted}; font-size:12px; cursor:pointer;`);
  closeBtn.textContent = 'Manuel Kapat';
  closeBtn.addEventListener('click', () => {
    const pos = state.get('position');
    if (pos) closeManually(pos.currentPrice ?? pos.entry);
  });

  card.appendChild(coinLine);
  card.appendChild(pnlLine);
  card.appendChild(tpLine);
  card.appendChild(timerLine);
  card.appendChild(closeBtn);

  // Pozisyon abone
  let _timerInterval = null;

  const _renderPos = (pos) => {
    if (!pos) {
      card.style.display = 'none';
      if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
      return;
    }

    card.style.display = 'block';
    const pnl = pos.unrealizedPnl ?? 0;
    const pnlColor = pnl >= 0 ? C.green : C.red;

    coinLine.textContent     = `${pos.coin} ${pos.side}  ×${pos.leverage}  $${pos.size}`;
    coinLine.style.color     = pos.side === 'LONG' ? C.green : C.red;

    pnlLine.textContent      = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
    pnlLine.style.color      = pnlColor;

    tpLine.style.color       = C.blue;
    tpLine.textContent       = `TP ${_fmt(pos.tp)}   SL ${_fmt(pos.sl)}   Giriş ${_fmt(pos.entry)}`;

    // Süre sayacı
    if (!_timerInterval) {
      _timerInterval = setInterval(() => {
        const secs = Math.floor((Date.now() - pos.openTime) / 1000);
        const m = String(Math.floor(secs / 60)).padStart(2, '0');
        const s = String(secs % 60).padStart(2, '0');
        timerLine.textContent = `${m}:${s}  ·  ${_fmt(pos.currentPrice ?? pos.entry)}`;
        timerLine.style.color = secs > 600 ? C.yellow : C.muted;
      }, 1000);
    }
  };

  _renderPos(state.get('position'));
  _unsubs.push(state.on('change:position', _renderPos));

  // Interval temizliği için tracker
  _unsubs.push(() => { if (_timerInterval) clearInterval(_timerInterval); });

  return card;
}

function _buildSetupSection() {
  const section = _el('div', 'padding:12px;');

  const title = _el('div', `font-size:11px; color:${C.muted}; letter-spacing:1px; margin-bottom:10px;`);
  title.textContent = 'SETUP LİSTESİ';
  section.appendChild(title);

  const list = _el('div', 'display:flex; flex-direction:column; gap:8px;');
  _setupList = list;
  section.appendChild(list);

  // Scanner tamamlandığında yenile
  _unsubs.push(state.on('scanner:done', () => _renderSetups()));
  _unsubs.push(state.on('change:setups', () => _renderSetups()));

  _renderSetups();
  return section;
}

// --- Setup listesi renderer ---

function _renderSetups() {
  if (!_setupList) return;

  const setups = state.get('setups');

  // Mevcut kartları temizle (event listener'lar node'la birlikte gider)
  while (_setupList.firstChild) _setupList.removeChild(_setupList.firstChild);

  if (!setups.length) {
    const empty = _el('div', `text-align:center; color:${C.muted}; font-size:13px; padding:24px;`);
    empty.textContent = 'Tarama bekleniyor…';
    _setupList.appendChild(empty);
    return;
  }

  setups.forEach(setup => {
    const card = _buildSetupCard(setup);
    _setupList.appendChild(card);
  });
}

function _buildSetupCard(setup) {
  const signalColor = setup.signal === 'GİR'
    ? C.green : setup.signal === 'HAZIRLAN' ? C.yellow : C.muted;

  const card = _el('div', `background:${C.panel}; border-radius:10px;
    border:1px solid ${setup.signal === 'GİR' ? C.green + '44' : setup.signal === 'HAZIRLAN' ? C.yellow + '33' : C.border};
    padding:12px; cursor:pointer; transition:opacity 0.15s;`);

  card.addEventListener('click', () => openModal(setup));
  card.addEventListener('touchstart', () => { card.style.opacity = '0.7'; });
  card.addEventListener('touchend',   () => { card.style.opacity = '1'; });

  // Üst satır: coin + signal badge
  const top = _el('div', 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;');

  const coinEl = _el('div', `font-family:'Space Mono',monospace; font-size:14px; font-weight:700;
    color:${setup.side === 'LONG' ? C.green : C.red};`);
  coinEl.textContent = `${setup.coin} ${setup.side}`;

  const badge = _el('div', `font-family:'Space Mono',monospace; font-size:11px; font-weight:700;
    color:${signalColor}; background:${signalColor}22; padding:3px 8px; border-radius:6px;`);
  badge.textContent = setup.signal;

  top.appendChild(coinEl);
  top.appendChild(badge);
  card.appendChild(top);

  // Gate dotları
  const dots = _el('div', 'display:flex; gap:5px; margin-bottom:8px;');
  [1,2,3,4,5].forEach(i => {
    const dot = _el('div', `width:6px; height:6px; border-radius:50%;
      background:${setup.gates[`g${i}`] ? C.green : C.border};`);
    dots.appendChild(dot);
  });
  // Dot yanına gate sayısı
  const scoreEl = _el('span', `font-size:11px; color:${signalColor}; margin-left:6px;`);
  scoreEl.textContent = `${setup.gateScore}/5`;
  dots.appendChild(scoreEl);
  card.appendChild(dots);

  // Meta: RSI, funding, taker
  const meta = _el('div', `font-size:11px; color:${C.muted}; display:flex; gap:12px;`);
  const items = [
    `RSI ${setup.rsi}`,
    `F ${setup.funding}%`,
    `T ${setup.takerRatio}`,
  ];
  items.forEach(txt => {
    const s = _el('span'); s.textContent = txt;
    meta.appendChild(s);
  });
  card.appendChild(meta);

  return card;
}

// --- yardımcılar ---

function _el(tag, cssText = '') {
  const node = document.createElement(tag);
  if (cssText) node.style.cssText = cssText;
  return node;
}

function _fmt(price) {
  if (!price) return '—';
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1)    return price.toFixed(4);
  return price.toFixed(6);
}
