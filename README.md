# IDDAA AI Predictor

API-Football verileriyle gerçek maç fikstürü ve bookmaker oranlarını analiz eder.

## Maç sayısı, takım adları ve oranlar

API-Football'ın `/odds` endpoint'i sayfa başına 10 maç döndürür. Tüm sonuçları tek bir HTTP isteğinde almak mümkün değildir. Uygulama artık `paging.total` bilgisini okuyup sayfaları sırayla/toplu şekilde çeker; varsayılan olarak en fazla 9 odds sayfası (90 oranlı maç) alır.

Takım ve lig adları `/fixtures?date=...` yanıtından alınır, oranlarla fixture ID üzerinden birleştirilir. Böylece odds yanıtında bulunmayan takım adları tamamlanır. Bir yenilemede 1 fixtures isteği + 1-9 odds isteği yapılır.

API-Football ön maç oranları yaklaşık her 3 saatte güncellenir; bu nedenle varsayılan önbellek 3 saattir. Dokümantasyon, odds için 1 çağrı/3 saat önerir. Ücretsiz planın günlük kotasını korumak için 9 sayfalık sınır vardır. Günün maç sayısı 90'dan fazlaysa bazı oranlı maçlar listelenmeyebilir.

Oranlar API-Football'ın bookmaker kaynaklarından gelir; iddaa.com oranı oldukları garanti edilmez. İlk uygun bookmaker seçilir. Belirli bir sağlayıcı istenirse Render'da `API_FOOTBALL_BOOKMAKER_ID` tanımlanabilir.

## Render Environment Variables

- `API_FOOTBALL_KEY`: API-Football dashboard anahtarı
- `API_FOOTBALL_TIMEZONE`: `Europe/Istanbul`
- `MAX_ODDS_PAGES`: `9` (en fazla 90 oranlı maç)
- `BULLETIN_CACHE_MS`: `10800000` (3 saat)
- `ALLOW_DEMO`: `false`

API anahtarını GitHub'a ekleme; yalnızca Render Environment bölümünde tut.

## Çalıştırma

```bash
npm install
npm start
```

API anahtarı yoksa gerçek veri modu hata verir; sahte maç üretmez.

## Tahmin modeli

Oranlardan türetilen piyasa verileri yerel olasılık modeliyle karşılaştırılır. Bu uygulama bağımsız doğrulanmış/eğitilmiş bir makine öğrenmesi modeli değildir. Tahminler garanti vermez; bahis kayıp riski taşır.
