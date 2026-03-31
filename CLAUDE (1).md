# CLAUDE.md — SpooXoV11Extreme

## Proje Özeti

SpooXoV11Extreme, Binance Futures piyasasında **scalping** stratejisi için tasarlanmış bir karar destek terminalidir.

**Tek hedef:** Günde 100 işlem açmak, her işlemden **$1 net kar** elde edip kapatmak.

Bu araç yalnızca **karar desteği** sağlar. Hiçbir işlem otomatik açılmaz veya kapatılmaz. Tüm emirler kullanıcı tarafından manuel olarak Binance'de gerçekleştirilir.

---

## Kullanıcı Profili

- Binance Futures deneyimli aktif trader
- Scalping odaklı, 3–10 dakika pozisyon süresi
- Pozisyon büyüklüğü: $100–$300
- Kaldıraç: değişken (genellikle 10x–20x)
- Platform: Android Chrome PWA (öncelik) + masaüstü tarayıcı
- Dil: Türkçe arayüz

---

## Temel Felsefe

### Neden V10 başarısız oldu?
- 10.935 satır tek dosya → bakım imkânsız
- Global state her şeyi tetikliyor → render bug'ları
- 300 coin aynı anda işleniyor → odak yok
- Spec olmadan yazıldı → Open Positions hiç düzeltilemedi
- Sonuç odaklı değil, özellik odaklıydı

### V11'in kuralları
1. **Az coin, yüksek kalite** — sadece top 30 likit Binance Futures çifti
2. **Her modül izole** — scanner, calculator, tracker ayrı JS modülleri
3. **Gerçek zamanlı veri** — WebSocket öncelikli, REST fallback
4. **Sonuç ekranda büyük** — TP fiyatı, net kar, sayaç her zaman görünür
5. **Sıfır gürültü** — sadece aksiyon gerektiren bilgi gösterilir

---

## Matematik Motoru (Kritik)

### Fee Yapısı
- Binance Futures Taker fee: **%0.05** (her yön)
- Maker fee: **%0.02** (limit emir)
- Varsayılan: taker (piyasa emri ile scalping)

### Net $1 Kar Hesaplama Formülü

```
brüt_hedef = net_hedef + (pozisyon_büyüklüğü × 0.001)
# 0.001 = %0.05 gidiş + %0.05 dönüş = %0.10 toplam fee

long_tp = giriş_fiyatı × (1 + brüt_hedef / (pozisyon_büyüklüğü × kaldıraç))
short_tp = giriş_fiyatı × (1 - brüt_hedef / (pozisyon_büyüklüğü × kaldıraç))
```

### Örnekler

| Pozisyon | Kaldıraç | Fee | Net $1 için TP hareketi |
|----------|----------|-----|------------------------|
| $100     | 10x      | $0.10 | %0.110 fiyat hareketi |
| $200     | 10x      | $0.20 | %0.060 fiyat hareketi |
| $300     | 10x      | $0.30 | %0.043 fiyat hareketi |
| $100     | 20x      | $0.10 | %0.055 fiyat hareketi |
| $200     | 20x      | $0.20 | %0.030 fiyat hareketi |

### Stop Loss Kuralı
- Minimum RR: **1:1.5** (zarar stop = kar hedefinin 1.5 katı mesafede)
- $1 net hedefte SL mesafesi = TP mesafesi × 1.5
- Örnek: $200, 10x → TP %0.06 → SL %0.09

---

## Setup Engine — 5 Gate Sistemi

Bir coin ancak **5 gate'in tamamını geçerse** GİR sinyali üretir.

### Gate 1: Funding Rate Filtresi
```
GEÇER: -0.05% < funding < +0.05%
GEÇMEZ: funding ≥ +0.05% (long kalabalık, squeeze riski)
GEÇMEZ: funding ≤ -0.05% (short kalabalık, squeeze riski)
```
**Neden:** Yüksek funding = kalabalık taraf = ani tersine dönüş riski.

### Gate 2: OI + Fiyat Uyumu
```
LONG setup: OI artıyor VE fiyat artıyor (gerçek alıcı baskısı)
SHORT setup: OI artıyor VE fiyat düşüyor (gerçek satıcı baskısı)
GEÇMEZ: OI düşüyor (pozisyon kapatılıyor, trend bitebilir)
```
**Neden:** OI artışı = yeni para giriyor. Fiyat yönüyle uyum = sahte hareket değil.

### Gate 3: Taker Flow Baskısı
```
LONG setup: taker_buy_volume > taker_sell_volume × 1.3 (son 3 mum)
SHORT setup: taker_sell_volume > taker_buy_volume × 1.3 (son 3 mum)
```
**Neden:** Taker akışı piyasayı hareket ettiren gerçek baskıyı gösterir.

### Gate 4: 1m RSI Momentum Bandı
```
LONG setup: RSI 45–70 arasında VE önceki mumdan yüksek
SHORT setup: RSI 30–55 arasında VE önceki mumdan düşük
GEÇMEZ: RSI 70+ (overbought, geç kalındı)
GEÇMEZ: RSI 30- (oversold, ama scalp için riskli)
```
**Neden:** Trend içinde momentum var mı? Aşırı bölgede girmek scalp'i mahveder.

### Gate 5: Volume Spike Onayı
```
GEÇER: son_mum_volume > son_20_mum_ortalama × 1.5
```
**Neden:** Volume olmadan fiyat hareketi sürdürülebilir değil.

### Sinyal Sınıfları
```
GİR      → 5/5 gate geçti
HAZIRLAN → 4/5 gate geçti (hangi gate eksik gösterilir)
GIRME    → 3/5 veya daha az
```

---

## Modül Mimarisi

```
SpooXoV11Extreme/
├── CLAUDE.md              ← bu dosya
├── index.html             ← tek deploy dosyası (tüm modüller inline)
├── src/
│   ├── core/
│   │   ├── state.js       ← merkezi state yönetimi (EventEmitter)
│   │   ├── binance.js     ← WebSocket + REST API katmanı
│   │   └── storage.js     ← localStorage wrapper
│   ├── modules/
│   │   ├── scanner.js     ← 5 Gate setup engine
│   │   ├── calculator.js  ← TP/SL/fee hesaplama
│   │   ├── tracker.js     ← aktif pozisyon takibi
│   │   └── counter.js     ← günlük sayaç ($0 → $100)
│   └── ui/
│       ├── dashboard.js   ← ana ekran render
│       ├── modal.js       ← coin detay + GİR butonu
│       └── alerts.js      ← ses + titreşim bildirimleri
```

**Önemli:** Geliştirme sırasında modüller ayrı dosyalarda tutulur. Build aşamasında tek `index.html` dosyasına bundle edilir (tiiny.host / PWA deploy için).

---

## Veri Katmanı

### Coin Listesi (Top 30 Likit)
Sabit liste, runtime'da güncellenmiyor:
```js
const COINS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'DOGEUSDT','ADAUSDT','AVAXUSDT','LTCUSDT','LINKUSDT',
  'DOTUSDT','MATICUSDT','UNIUSDT','ATOMUSDT','NEARUSDT',
  'APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
  'SEIUSDT','TIAUSDT','WLDUSDT','FETUSDT','AGIXUSDT',
  'RNDRUSDT','TRBUSDT','ORDIUSDT','SATSUSDT','1000PEPEUSDT'
];
```

### WebSocket Yapısı
```
wss://fstream.binance.com/stream?streams=
  btcusdt@kline_1m/
  btcusdt@aggTrade/
  btcusdt@markPrice/
  ... (tüm coinler)
```

**Rate limit:** Binance combined stream max 200 stream/bağlantı. 30 coin × 3 stream = 90 → tek bağlantı yeterli.

### REST Endpoints (başlangıç verisi)
```
GET /fapi/v1/ticker/24hr → fiyat, hacim, değişim
GET /fapi/v1/openInterest → OI snapshot
GET /fapi/v1/fundingRate → güncel funding
GET /fapi/v1/aggTrades → taker flow hesabı
```

### API Key
- Sadece **okuma** izni (trading izni verilmez)
- XOR+Base64 ile localStorage'da şifreli saklanır (V10'dan miras)
- Pozisyon takibi için: `/fapi/v2/account` (HMAC imzalı)

---

## State Mimarisi

V10'daki global `S` objesinin hatalarını tekrarlama. EventEmitter pattern kullan:

```js
// state.js
const State = {
  coins: new Map(),        // symbol → CoinData
  activePosition: null,    // tek aktif takip pozisyonu
  dailyCounter: {
    trades: 0,
    netPnl: 0,
    target: 100
  },
  settings: {
    positionSize: 200,
    leverage: 10,
    netTarget: 1.0,
    feeRate: 0.0005
  }
};

// Değişiklik bildirimi
const emitter = new EventTarget();
function setState(key, value) {
  State[key] = value;
  emitter.dispatchEvent(new CustomEvent('stateChange', { detail: { key, value } }));
}
```

---

## UI Kuralları

### Renk Paleti (V10'dan korunuyor, tutarlılık için)
```css
:root {
  --bg:    #060a0f;   /* ana arka plan */
  --bg1:   #0b1017;
  --bg2:   #111c28;
  --bg3:   #182535;
  --g:     #00ff88;   /* yeşil / long */
  --r:     #ff4466;   /* kırmızı / short */
  --y:     #ffd000;   /* sarı / uyarı */
  --b:     #40c4ff;   /* mavi / bilgi */
  --pu:    #c87fff;   /* mor / UI accent */
  --tx0:   #f0f8ff;   /* birincil metin */
  --tx1:   #a8c8e8;   /* ikincil metin */
  --tx2:   #6a9abf;   /* üçüncül metin */
  --mono:  'Space Mono', monospace;
  --ui:    'DM Sans', sans-serif;
}
```

### Ekran Düzeni (Android öncelikli)
```
┌─────────────────────────┐
│  NAV: SpooXo | BTC fiyat│  ← sticky, 52px
├─────────────────────────┤
│  GÜNLÜK SAYAÇ           │  ← her zaman görünür
│  $0 ──────────── $100   │
│  [0 işlem] [+$0.00]     │
├─────────────────────────┤
│  AKTİF POZİSYON (eğer)  │  ← sadece pozisyon varsa
│  BTC LONG | GİRİŞ: X    │
│  TP: Y | P&L: +$0.47    │
├─────────────────────────┤
│  SETUP LİSTESİ          │  ← scroll edilebilir
│  [GİR]  BTC  5/5 ●●●●● │
│  [HAZ]  ETH  4/5 ●●●●○ │
│  [---]  SOL  3/5 ●●●○○ │
└─────────────────────────┘
```

### Kritik UI Kuralları
1. **TP fiyatı her zaman büyük yazı ile gösterilir** — gözden kaçmamalı
2. **GİR butonu** — yeşil, büyük, tap dostu (min 48px yükseklik)
3. **Günlük sayaç** — progress bar + dolar tutarı, ekrandan kaybolmaz
4. **Aktif pozisyon P&L** — gerçek zamanlı, kırmızı/yeşil renk geçişi
5. **Ses uyarısı** — TP'ye ulaşınca 3 bip, SL'ye yaklaşınca 2 bip

---

## Calculator Modülü (Tam Spec)

```js
// calculator.js
function calcTP(params) {
  const { entryPrice, side, positionSize, leverage, netTarget, feeRate } = params;
  
  const totalFee = positionSize * feeRate * 2; // gidiş + dönüş
  const grossTarget = netTarget + totalFee;
  const moveRatio = grossTarget / (positionSize * leverage);
  
  return {
    tpPrice: side === 'LONG'
      ? entryPrice * (1 + moveRatio)
      : entryPrice * (1 - moveRatio),
    slPrice: side === 'LONG'
      ? entryPrice * (1 - moveRatio * 1.5)
      : entryPrice * (1 + moveRatio * 1.5),
    feeTotal: totalFee,
    grossTarget,
    movePercent: (moveRatio * 100).toFixed(4),
    rrRatio: '1:1.5'
  };
}
```

---

## Position Tracker Modülü (Tam Spec)

```js
// tracker.js
const ActivePosition = {
  symbol: null,
  side: null,           // 'LONG' | 'SHORT'
  entryPrice: null,
  positionSize: null,
  leverage: null,
  tpPrice: null,
  slPrice: null,
  openedAt: null,
  
  // Hesaplanan (WebSocket'ten)
  currentPrice: null,
  unrealizedPnl: null,  // fee düşülmüş
  elapsedSeconds: null,
};

// WebSocket fiyat güncellemesi geldiğinde
function updatePosition(currentPrice) {
  if (!ActivePosition.symbol) return;
  
  const { side, entryPrice, positionSize, leverage } = ActivePosition;
  const move = side === 'LONG'
    ? (currentPrice - entryPrice) / entryPrice
    : (entryPrice - currentPrice) / entryPrice;
  
  const grossPnl = move * positionSize * leverage;
  const fee = positionSize * 0.0005 * 2;
  ActivePosition.unrealizedPnl = grossPnl - fee;
  ActivePosition.currentPrice = currentPrice;
  
  // TP/SL alarm kontrolü
  checkAlarms(currentPrice);
  
  // UI güncelle
  renderPosition();
}

function checkAlarms(price) {
  const { side, tpPrice, slPrice } = ActivePosition;
  
  // TP'ye ulaştı
  if (side === 'LONG' && price >= tpPrice) triggerTPAlarm();
  if (side === 'SHORT' && price <= tpPrice) triggerTPAlarm();
  
  // SL'ye yaklaştı (%80 mesafe)
  const slDistance = Math.abs(ActivePosition.entryPrice - slPrice);
  const currentDistance = Math.abs(price - slPrice);
  if (currentDistance < slDistance * 0.2) triggerSLWarning();
}
```

---

## Günlük Sayaç Modülü

```js
// counter.js
// Her gün gece 00:00 UTC'de sıfırlanır

function addTrade(netPnl) {
  const today = new Date().toISOString().split('T')[0];
  const stored = JSON.parse(localStorage.getItem('spooxo_daily') || '{}');
  
  if (stored.date !== today) {
    // Yeni gün, sıfırla
    stored.date = today;
    stored.trades = 0;
    stored.netPnl = 0;
  }
  
  stored.trades += 1;
  stored.netPnl += netPnl;
  localStorage.setItem('spooxo_daily', JSON.stringify(stored));
  
  return stored;
}
```

---

## Ses Alarm Sistemi

V10'da çalışmayan alarm sisteminin doğru implementasyonu:

```js
// alerts.js
// Web Audio API kullan — harici ses dosyası gerektirmez

function createBeep(frequency, duration, volume = 0.3) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.frequency.value = frequency;
  gainNode.gain.value = volume;
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration / 1000);
}

function triggerTPAlarm() {
  // 3 yüksek bip — zafer sesi
  createBeep(880, 150); 
  setTimeout(() => createBeep(880, 150), 200);
  setTimeout(() => createBeep(1100, 300), 400);
  
  // Vibration (Android)
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
}

function triggerSLWarning() {
  // 2 alçak bip — uyarı
  createBeep(440, 200);
  setTimeout(() => createBeep(330, 400), 300);
  
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
```

---

## Geliştirme Sırası

Claude Code bu sırayı takip etmeli:

### Faz 1 — Core (önce çalışan, sonra güzel)
1. `state.js` — EventEmitter state yönetimi
2. `calculator.js` — TP/SL hesaplama + test
3. `counter.js` — günlük sayaç + localStorage
4. `alerts.js` — ses + titreşim sistemi

### Faz 2 — Veri
5. `binance.js` — REST başlangıç verisi (WebSocket olmadan test)
6. WebSocket entegrasyonu
7. `scanner.js` — 5 Gate engine

### Faz 3 — UI
8. `dashboard.js` — ana ekran
9. `modal.js` — coin detay + GİR butonu
10. `tracker.js` — aktif pozisyon paneli

### Faz 4 — Bundle
11. Tüm modüller tek `index.html` dosyasına bundle
12. PWA manifest + Service Worker
13. Android Chrome PWA install testi

---

## Kaçınılacak Hatalar (V10'dan öğrenilen)

| Hata | Çözüm |
|------|-------|
| Global state her yerde mutate ediliyor | Sadece `setState()` fonksiyonu üzerinden değişiklik |
| `innerHTML` ile DOM render → event listener kaybı | `renderPosition()` sadece değişen elementleri günceller |
| 300 coin aynı anda WebSocket → memory leak | Sadece 30 coin, combined stream |
| `openModal` override zinciri → bug izolasyonu imkânsız | Her modül kendi event listener'ını yönetir |
| Timer/interval temizlenmeden sayfa geçişi | Her modül `destroy()` metodu içerir |
| Alarm sistemi race condition | Alarm state merkezi `alerts.js`'de, başka yerden tetiklenemiyor |

---

## Test Kontrol Listesi

Her modül için:
- [ ] Fee hesabı doğru mu? ($200, 10x → fee $0.20, TP %0.060)
- [ ] SL, TP mesafesinin 1.5 katı uzaklıkta mı?
- [ ] WebSocket bağlantısı kesilince otomatik yeniden bağlanıyor mu?
- [ ] Gün değişiminde sayaç sıfırlanıyor mu?
- [ ] TP alarm sadece bir kez çalıyor mu? (tekrar tetiklenme yok)
- [ ] Android Chrome'da titreşim çalışıyor mu?
- [ ] API key localStorage'dan doğru okunup şifresi çözülüyor mu?

---

## Notlar

- Bu proje **karar destek aracıdır**, otomatik trading aracı değil
- Binance hesabına hiçbir zaman otomatik emir gönderilmez
- Tüm işlemler kullanıcı tarafından Binance uygulamasında manuel açılır
- API key sadece **okuma** ve **hesap bilgisi** için kullanılır
