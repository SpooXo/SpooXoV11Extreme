# SpooXoV11Extreme

Binance Futures scalping karar destek terminali.

**Hedef:** Günde 100 işlem, her işlemden $1 net kar.  
**Pozisyon:** $100–300 | **Süre:** 3–10 dakika | **Kaldıraç:** 10x–20x  
**Kural:** Tüm işlemler manuel. Bu araç sadece karar desteği sağlar.

---

## Matematik

Taker fee: %0.05 her yön.

```
totalFee    = pozisyon × 0.001
grossTarget = 1 + totalFee
moveRatio   = grossTarget / (pozisyon × kaldıraç)

LONG  TP = giriş × (1 + moveRatio)
SHORT TP = giriş × (1 - moveRatio)
SL       = TP mesafesi × 1.5   → RR 1:1.5
```

---

## 5 Gate Sistemi

| Gate | Koşul |
|------|-------|
| Gate1 | -0.05% < funding < +0.05% |
| Gate2 | OI artıyor VE fiyat yönüyle uyumlu |
| Gate3 | Taker buy/sell oranı > 1.3 (son 3 mum) |
| Gate4 | RSI 45–70 (long) veya 30–55 (short) ve momentum var |
| Gate5 | Son mum volume > 20 mum ortalaması × 1.5 |

- **5/5 → GİR**
- **4/5 → HAZIRLAN**
- **3/5 ve altı → GIRME**

---

## Coin Listesi (30 adet)

```
BTCUSDT ETHUSDT BNBUSDT SOLUSDT XRPUSDT
DOGEUSDT ADAUSDT AVAXUSDT LTCUSDT LINKUSDT
DOTUSDT MATICUSDT UNIUSDT ATOMUSDT NEARUSDT
APTUSDT ARBUSDT OPUSDT INJUSDT SUIUSDT
SEIUSDT TIAUSDT WLDUSDT FETUSDT AGIXUSDT
RNDRUSDT TRBUSDT ORDIUSDT SATSUSDT 1000PEPEUSDT
```

---

## Modüller

```
src/
├── core/
│   ├── state.js        EventEmitter tabanlı global state yönetimi
│   ├── binance.js      WebSocket + REST API
│   └── storage.js      Kalıcı veri (localStorage/IndexedDB)
├── modules/
│   ├── scanner.js      5 gate değerlendirmesi
│   ├── calculator.js   TP/SL hesaplama
│   ├── tracker.js      Aktif pozisyon takibi
│   └── counter.js      Günlük sayaç ($0→$100)
└── ui/
    ├── dashboard.js    Ana ekran
    ├── modal.js        Setup detay modalı
    └── alerts.js       Web Audio API bip + titreşim
```

---

## Geliştirme Sırası

1. **Faz 1 – Core:** state → calculator → counter → alerts
2. **Faz 2 – Veri:** binance REST → WebSocket → scanner
3. **Faz 3 – UI:** dashboard → modal → tracker
4. **Faz 4 – Bundle:** Tek `index.html`, PWA manifest

---

## UI Spec

**Platform:** Android PWA öncelikli

**Ekranda her zaman:**
- Günlük sayaç ($0→$100 progress bar)
- Aktif pozisyon P&L (gerçek zamanlı)
- Setup listesi (GİR / HAZIRLAN / GIRME)
- TP fiyatı büyük ve belirgin

**Renk paleti:**
```
bg      #060a0f
green   #00ff88
red     #ff4466
yellow  #ffd000
blue    #40c4ff
purple  #c87fff
```

**Font:** Space Mono (monospace/sayılar) + DM Sans (metin)

---

## V10'dan Gelen Hatalar — Tekrarlanmayacak

- Global state yok → sadece `setState()` kullanılacak
- `innerHTML` ile event listener kaybı yok
- 300 coin yok → sabit 30 coin listesi
- `openModal` override zinciri yok
- Timer temizlenmeden çıkış yok
- Alarm race condition yok
