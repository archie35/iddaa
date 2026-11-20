# IDDAA AI Predictor

Highlightly Football API üzerinden gerçek maç fikstürlerini alır ve yerel tahmin modeliyle analiz eder.

## Veri kaynağı

- Sağlayıcı: Highlightly Football API
- Ana adres: `https://soccer.highlightly.net`
- Türkiye ve Avrupa maçları: API'nin kapsadığı liglerden alınır. Servis 950+ lig ve 170+ ülke kapsamı bildirmektedir.
- Fikstür aralığı: Bugün ve takip eden 6 gün.
- Takım formu: `/last-five-games?teamId=...` endpoint'iyle son 5 tamamlanmış maç.
- Önbellek: Varsayılan 8 saat; takım formu ayrıca 6 saat saklanır.
- Ücretsiz Basic kota: Günlük 100 istek. Bir yenilemede 7 fikstür isteği ve en fazla 20 takım formu isteği yapılır. Render yeniden başlatılırsa bellek önbelleği sıfırlanır.

## Oranlar

Highlightly Basic/Free planında bahis oranları sunulmaz. Bu nedenle ücretsiz planda oranlar boş kalır, fakat maç tahminleri takım formu ve gol ortalamalarıyla üretilir. Oranı olmayan maçlar toplam oranlı kuponlara dahil edilmez. Ücretli bir oran planı kullanılacaksa odds endpoint entegrasyonu ayrıca etkinleştirilmelidir.

## Render Environment Variables

- `HIGHLIGHTLY_API_KEY`: Highlightly Dashboard API anahtarı
- `HIGHLIGHTLY_BASE_URL`: `https://soccer.highlightly.net`
- `HIGHLIGHTLY_TIMEZONE`: `Europe/Istanbul`
- `HIGHLIGHTLY_MAX_FORM_TEAMS`: Yenilemede formu alınacak azami takım sayısı (varsayılan 20)
- `BULLETIN_CACHE_MS`: Önbellek süresi (varsayılan 8 saat)
- `ALLOW_DEMO`: `false`

API anahtarını GitHub'a veya frontend koduna koyma. Yalnızca Render > Environment bölümünde sakla. Eski `API_FOOTBALL_KEY` değişkeni artık kullanılmıyor.

## Çalıştırma

```bash
npm install
npm start
```

API geçici olarak hata verirse bellekteki son başarılı fikstür korunur. Render yeniden başlatıldığında bellek cache'i sıfırlanır.

## Tahmin modeli

Son beş maç formu ve maç başına atılan/yenilen gol ortalamaları modele aktarılır. Bu veriler bulunamazsa model sınırlı veri uyarısıyla daha düşük güven seviyesinde tahmin üretir; takım verisi uydurmaz. Bu uygulama bağımsız doğrulanmış/eğitilmiş bir makine öğrenmesi modeli değildir. Tahminler garanti vermez; bahis kayıp riski taşır.
