# IDDAA AI Predictor

API-Football verileriyle maç oranlarını analiz eden uygulama.

## Veri ve istek kotası

Bu sürüm, maç başına ayrı ayrı `/odds` ve `/predictions` çağrıları yapmaz. Her yenilemede tek bir toplu istek kullanır:

```
GET /odds?date=YYYY-MM-DD&timezone=Europe/Istanbul&page=1
```

API-Football odds endpoint'i tarih filtresi destekler ve sayfa başına 10 sonuç döndürür. Uygulama ilk sayfayı kullanır; bu nedenle bir yenilemede en fazla 10 oranlı maç listelenir. Veriler sunucu belleğinde varsayılan 1 saat saklanır. Aynı anda gelen istekler tek bir yenileme paylaşır.

**Önemli:** Bellek önbelleği Render servisi yeniden başladığında veya uyku modundan döndüğünde sıfırlanır. Dolayısıyla her normal çalışma süresinde saat başına en fazla 1 API isteği hedeflenir; yeniden başlatma/soğuk açılışta ek istek oluşabilir. Render'ın ücretsiz servisi uykuya geçtiğinde zamanlanmış arka plan yenilemesi yapamaz.

Oranlar API-Football'ın sağladığı bookmaker verileridir; doğrudan iddaa.com oranı olduğu garanti edilmez. Ücretsiz API planı günlük istek kotasına tabidir. Güncel kota ve kapsam için API-Football dashboard'unu kontrol et.

## Render Environment Variables

- `API_FOOTBALL_KEY`: API-Football dashboard'dan alınan anahtar
- `API_FOOTBALL_TIMEZONE`: `Europe/Istanbul`
- `MAX_MATCHES`: `10` (tek API sayfasının sınırı)
- `BULLETIN_CACHE_MS`: `3600000` (1 saat)
- `ALLOW_DEMO`: `false`

API anahtarını GitHub'a ekleme; yalnızca Render Environment bölümüne koy.

## Çalıştırma

```bash
npm install
npm start
```

API anahtarı yoksa gerçek veri modu hata verir; sahte maç üretmez.

## Tahmin modeli

API-Football toplu oranlarından gelen maç ve bookmaker oranları, yerel olasılık hesaplamasına girer. Bu uygulama eğitilmiş/bağımsız doğrulanmış bir makine öğrenmesi modeli değildir. Tahminler garanti vermez; bahis kayıp riski taşır.
