# IDDAA AI Predictor

Highlightly Football API üzerinden gerçek maç fikstürlerini alır ve yerel olasılık modeliyle analiz eder.

## Analiz türleri

Kullanıcı analiz ekranında bir pazar seçer:
- Taraf bahsi: MS 1 / MS X / MS 2
- Alt / Üst 2.5 gol
- KG Var / KG Yok

Maçlar seçilen pazardaki model güvenine göre yüksekten düşüğe sıralanır. Alt/Üst ve KG tahminleri için her iki takımın son maçlarından gol atma/yeme ortalamaları gerekir; bu veriler yoksa tahmin uydurulmaz ve maç için veri eksikliği gösterilir.

## Veri kaynağı

- Sağlayıcı: Highlightly Football API
- Ana adres: `https://soccer.highlightly.net`
- Fikstür aralığı: Bugün ve takip eden 6 gün.
- Takım formu: `/last-five-games?teamId=...` endpoint'iyle son 5 tamamlanmış maç.
- Önbellek: Varsayılan 8 saat; takım formu ayrıca 6 saat saklanır.
- Ücretsiz Basic kota: Günlük 100 istek. Bir yenilemede 7 fikstür isteği ve en fazla 20 takım formu isteği yapılır.

## Oranlar

Highlightly ücretsiz planda bahis oranları sunulmadığından oran alanları boş kalır. Tahminler son maç formu ve gol ortalamalarıyla üretilir. Bu nedenle uygulama oranlı kupon üretmez.

## Render Environment Variables

- `HIGHLIGHTLY_API_KEY`: Highlightly Dashboard API anahtarı
- `HIGHLIGHTLY_BASE_URL`: `https://soccer.highlightly.net`
- `HIGHLIGHTLY_TIMEZONE`: `Europe/Istanbul`
- `HIGHLIGHTLY_MAX_FORM_TEAMS`: Yenilemede formu alınacak azami takım sayısı (varsayılan 20)
- `BULLETIN_CACHE_MS`: Önbellek süresi (varsayılan 8 saat)
- `ALLOW_DEMO`: `false`

API anahtarını GitHub'a veya frontend koduna koyma. Yalnızca Render Environment bölümünde sakla.

## Çalıştırma

```bash
npm install
npm start
```

API geçici olarak hata verirse bellekteki son başarılı fikstür korunur. Render yeniden başlatıldığında bellek cache'i sıfırlanır.

## Model notu

Bu uygulama bağımsız doğrulanmış/eğitilmiş bir makine öğrenmesi modeli değildir. Güven yüzdesi modelin kullandığı veri kalitesi ve tahmin olasılığından türetilen göreli bir göstergedir; gerçek başarı olasılığı veya garanti olarak yorumlanmamalıdır. Bahis kayıp riski taşır.
