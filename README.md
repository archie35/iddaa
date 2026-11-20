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
- Lig filtresi: Türkiye Süper Lig, İngiltere Premier League, İspanya La Liga, Almanya Bundesliga, İtalya Serie A, Fransa Ligue 1, Hollanda Eredivisie, Portekiz Primeira Liga, Belçika Pro League, İskoçya Premiership ve UEFA'nın üç ana kulüp turnuvası.
- Takım formu: `/last-five-games?teamId=...` endpoint'iyle son 5 tamamlanmış maç; W/D/L dizisi ve gol atma/yeme ortalamaları.
- Önbellek: Fikstür 12 saat, takım formu 24 saat.
- Form kapsamı: Yenilemede en fazla 40 takımın (20 maçın iki tarafı) son 5 maç verisi çekilir. Daha fazla maç varsa tüm takımlar aynı yenilemede kapsanmayabilir.
- API çağrısı: Yenileme başına 7 fikstür + en fazla 40 form isteği. Günde iki yenilemede yaklaşık 94 istek; gerçek kota sağlayıcı paneline bağlıdır.

## Oranlar

Highlightly ücretsiz planda bahis oranları sunulmadığından oran alanları boş kalır. Tahminler son maç formu ve gol ortalamalarıyla üretilir. Bu nedenle uygulama oranlı kupon üretmez.

## Render Environment Variables

- `HIGHLIGHTLY_API_KEY`: Highlightly Dashboard API anahtarı
- `HIGHLIGHTLY_BASE_URL`: `https://soccer.highlightly.net`
- `HIGHLIGHTLY_TIMEZONE`: `Europe/Istanbul`
- `HIGHLIGHTLY_MAX_FORM_TEAMS`: Yenilemede formu alınacak azami takım sayısı (varsayılan 40)
- `BULLETIN_CACHE_MS`: Önbellek süresi (varsayılan 12 saat)
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
