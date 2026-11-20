# IDDAA AI Predictor

Gerçek zamanlı futbol bülteni + oran + istatistik destekli analiz uygulaması.

## Veri kaynağı

Bu sürüm **API-Football** kullanır. API-Football'ın ücretsiz planı şu anda günlük 100 istek ve 10 istek/dakika sınırı veriyor; fixtures, H2H, statistics, predictions ve pre-match odds endpoint'leri mevcut. Oranlar API-Football'daki bookmaker kaynaklarından gelir; bunlar doğrudan iddaa.com oranı olmak zorunda değildir. citeturn148749search0turn346849search0

API-Football predictions endpoint'i form, önceki maçlar, oyuncular ve diğer istatistiksel girdileri kullanarak kendi tahminlerini üretir. Bu uygulama bu olasılıkları kendi modelinin çıktısıyla birleştirir. citeturn194507search1turn194507search4

## Render ayarları

Render Environment Variables:

- `API_FOOTBALL_KEY` = API-Football dashboard'dan aldığın anahtar
- `API_FOOTBALL_TIMEZONE` = `Europe/Istanbul`
- `MAX_MATCHES` = `15`
- `FIXTURE_DAYS` = `3`
- `BULLETIN_CACHE_MS` = `3600000`
- `ALLOW_DEMO` = `false`

API anahtarını GitHub koduna yazma. Render Environment'a koy.

## Çalıştırma

```bash
npm install
npm start
```

API anahtarı yoksa gerçek veri modu çalışmaz; sahte maç üretmez.

## Model

Sistem:
1. Gerçek yaklaşan fixtures'ları çeker.
2. Pre-match bookmaker oranlarını çeker.
3. API-Football'ın form/geçmiş verilerini kullanan prediction çıktısını alır.
4. Bu çıktıyı yerel model ile birleştirir.
5. İma edilen olasılık, model olasılığı ve value farkını hesaplar.
6. Düşük/dengeli/yüksek risk kuponları oluşturur.

> Not: Bu sistem bahis sonucunu garanti etmez. Tahminler istatistiksel model çıktılarıdır.
