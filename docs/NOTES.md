# ZEMA — Yapılacaklar / Bilinen Eksikler

## ✅ R-798F26 tam tutarlı (25 Ağustos) — ve iki hata daha

`feedback_synthesis` yenilendi; altı kontrolün hepsi şablon düzeltmesinden
sonraki veriye dayanıyor.

| kontrol | karar | skor | üretim |
|---|---|---|---|
| language_template | fail | 35 | 13:26 |
| criteria_scoring | fail | 33 | 13:28 |
| similarity | pass | 0 | 13:28 (aday yok) |
| category_fit | **insufficient_evidence** | — | 13:29 |
| title_content | fail | 25 | 14:04 |
| feedback_synthesis | pass | — | 17:51 |

`feedback_synthesis` çıktısı diğerleriyle tutarlı — özet raporun Model Uydu
içeriği taşımasını ve zorunlu bölüm eksikliğini birlikte anlatıyor, beş
geliştirme maddesinin üçü `high`. Tutarlılık testleri 6/6:
puan/skor sızdırmıyor (§4.6), her maddede somut adım var, kategori
çelişkisine değiniyor, title_content'ten sonra üretilmiş.

### Hata 1 — model çıktısında bozuk Türkçe

`category_fit` payload'ında sistematik karakter ikamesi vardı:
`ç→'`, `ğ→ę`, `ö→&`, `ş→œ`, `Ü→U+0092`.

**Kaynağı boru hattı DEĞİL.** `extracted_text` tamamen sağlam: 1263 Türkçe
glif, sıfır bozuk karakter, metin kusursuz okunuyor ("MARMARA ÜNİVERSİTESİ
10.TÜRKSAT Model Uydu Yarışması 2025…"). On raporun onunda da bozulma yok.
Yani girdi temiz, **modelin o tek yanıtı** bozuk çıktı.

### Hata 2 — kanıt doğrulaması category_fit'e UYGULANMIYORDU

Şema yorumu *"kanıt doğrulaması bu alana da uygulanır — uydurulmuş alıntı
yakalanır"* diyordu. Uygulanmıyordu: `deriveVerdict` yalnızca alıntının
BOŞ OLMADIĞINA bakıyordu. Yani model uydurma veya bozuk bir alıntıyla
`fail` verdirebiliyordu — halüsinasyon kalkanındaki gerçek bir delik.

Düzeltme: `deriveVerdict` artık rapor metnini alıyor ve `conflicting_quote`'u
`makeVerifier` ile doğruluyor (diyakritik toleranslı, §4.5). Bulunamazsa
karar `fail` değil `insufficient_evidence`.

Kanıt: bozuk alıntı → doğrulama `none` → `insufficient_evidence`.
Rapordan alınmış gerçek bir alıntı → `exact` → `fail`. Yani kural sıkı
ama fazla sıkı değil.

Mevcut satır model çağrısı YAPILMADAN yeniden hesaplandı (9 category_fit
satırının 1'i değişti). Bu yüzden R-798F26'nın category_fit kararı artık
`insufficient_evidence` — bozuk alıntı doğrulanamadığı için dürüst olan bu.

**Açık kalan:** payload'daki bozuk metin hâlâ orada ve hakem ekranında
görünür. `category_fit`'i yeniden çalıştırmak (1 API çağrısı) temiz metin ve
muhtemelen doğrulanabilir bir alıntı getirir — asıl bulgu (Model Uydu raporu
İHA yarışmasında) zaten doğru ve `title_content` ile `feedback_synthesis`
tarafından da söyleniyor.

## 🔒 0009 uygulandı — kısıt canlı doğrulandı (25 Ağustos)

### Dosyadaki iki hata düzeltildi

**1) Sözdizimi (`42601`).** `raise exception` içinde bitişik dize
literalleri birleştirilmeye çalışılıyordu ve aralarında `E'...'` öneki
vardı. PostgreSQL bitişik literal birleştirmesinde `E` önekini kabul
etmiyor. Mesaj artık `raise exception '%', format(...)` biçiminde ve
parçalar açık `||` operatörüyle bağlanıyor.

**2) Tekrar çalıştırılamıyordu.** Kısıt bir kez eklendikten sonra dosya
"constraint already exists" ile patlıyordu. Artık `pg_constraint`
kontrolüyle sarıldı (0008'deki desenin aynısı), yani dosya güvenle
yeniden çalıştırılabilir ve no-op olur.

### Kısıt gerçekten aktif — service_role ile kanıtlandı

RLS baypas eden `service_role` ile mükerrer `(team_id, competition_id)`
INSERT denendi:

```
HTTP 409 · kod 23505
duplicate key value violates unique constraint
  "reports_one_entry_per_team_competition"
Key (team_id, competition_id)=(d83cdbe4-…, 65c9a2f2-…) already exists.
```

RLS baypas edildiği için engel KESİNLİKLE DB kısıtından geliyor.
Kapsam da doğru: **başka** bir takım aynı yarışmaya rapor ekleyebiliyor
(kısıt fazla geniş değil).

Uygulama katmanı da ayrıca 409 veriyor — kullanıcı ham duplicate-key
hatası değil, açıklayıcı Türkçe mesaj görüyor.

## 🔁 title_content yeniden çalıştırıldı (25 Ağustos)

Şablon düzeltmesinden önce koşan tek kontroldü. Sonuç anlamlı biçimde
değişti:

| | öncesi | sonrası |
|---|---|---|
| karar | warn | **fail** |
| uyum skoru | 65 | **25** |

Yeni çıktı `category_fit` ile tutarlı: başlığın vaat ettiği (Model Uydu
PDR, KONRUL, TÜRKSAT 2025) ile raporun İHA yarışmasına gönderilmiş olması
arasındaki çelişki yakalanıyor. "Başlıkta olmayan içerik" olarak model uydu
iniş hızı hesapları, paraşüt alanı, ayrılma mekanizması listeleniyor —
raporun gerçekten içerdiği şeyler.

**Not:** `feedback_synthesis` (13:30) ESKİ title_content çıktısından
(warn/65) beslendi. Yenilemek 1 API çağrısı — kullanıcı kararı.

### Yol boyunca bulunan denetlenebilirlik hatası

`analysis_results` upsert'i `created_at` yazmıyordu. Kolonun
`default now()` değeri yalnızca INSERT'te işliyor; satır güncellendiğinde
zaman damgası ESKİ kalıyordu. title_content yeniden çalıştırıldığında
verdict warn→fail ve payload tamamen değişti ama `created_at` 19 saat
önceki değerde kaldı.

Bu, PLAN §1'deki "her AI çıktısı için model ve zaman loglanır"
iddiasını çürütüyordu. `writeResult` artık `created_at`'i açıkça yazıyor;
mevcut bayat satır da düzeltildi.

## 🔑 TEST HESAPLARI — hepsinin şifresi `zema-test-2026`

| e-posta | ad | rol | bağlam |
|---|---|---|---|
| `yarismaci@zema.test` | Mehmet Şahin | yarışmacı | GARO · 2026 İHA |
| `yarismaci2@zema.test` | Burak Deniz Aslan | yarışmacı | VEGA_2026 · 2026 İHA (raporsuz) |
| `yarismaci3@zema.test` | Selin Aydın | yarışmacı | ORION_2025 · 2025 Model Uydu (raporsuz) |
| `yarismaci4@zema.test` | Kerem Doğan | yarışmacı | LYRA_2025 · 2025 Model Uydu (raporsuz) |
| `hakem@zema.test` | Zeynep Demir | hakem | atanmış raporlar |
| `hakem2@zema.test` | Mehmet Emre Çelebi | hakem | atanmış raporlar |
| `hakem3@zema.test` | Adem Coşar | hakem | R-798F26 burada |
| `hakem4@zema.test` | Elif Naz Bozkurt | hakem | atanmış raporlar |
| `degerlendirme@zema.test` | Ayşe Yılmaz | değerlendirme yöneticisi | yayımlama yetkisi |
| `yarisma@zema.test` | Mert Kaya | yarışma yöneticisi | şablon, kriter, kategori |

Raporsuz takımlar bilinçli: katılım kuralı bir takıma bir yarışmada tek rapor
izni veriyor, hangi raporun yükleneceği demo senaryosuna bağlı.
`yarismaci3`/`yarismaci4` ile giriş, 2025 Model Uydu'da temiz bir yükleme
akışı gösterir.

## 🧹 Katılım kuralı temizliği (25 Ağustos)

### Kural 1 ihlali çözüldü — 0009 artık uygulanabilir

GARO takımının 2026'da 5 raporu vardı. Karar: en değerlisi (`R-798F26`,
gerçek TEKNOFEST rapor+şablon çiftiyle test edilen) kalsın, diğerleri gitsin.

| rapor | işlem | sebep |
|---|---|---|
| R-798F26 `zema` | **GARO'da kaldı** | en eksiksiz, gerçek TEKNOFEST çifti |
| R-63406F `ZEMA` | **ZEMA_TEST takımına TAŞINDI** | silinmesi istenen 4'ün içindeydi ama "zema/ZEMA adlı verileri kaybetme" talimatıyla çelişiyordu — taşımak ikisini de karşılıyor |
| R-175C22 Otonom Su Altı Aracı | silindi | demo verisi |
| R-46A803 TESTMM 20-tabloA | silindi | asistan testi |
| R-1A98F4 TESTMM 21-tabloB | silindi | asistan testi |

Rapor sayısı 13 → 10. Demo seti 9 → 8 (R-175C22 gitti).

### Kural 2 ihlali çözüldü

Mehmet Şahin'in 9 üyeliği 1'e indi (yalnızca GARO). Sekiz üyelik silindi.

**Sonuç:** 9 takım üyesiz kaldı (ATMACA, RÜZGÂR, PUSAT, SİMURG, KIVILCIM,
BOZKURT, ŞAHİN, ALTAY, ZEMA_TEST) — raporları duruyor ve hakem/yönetici
ekranlarında görünüyor, ama hiçbir yarışmacı hesabı onları "kendi raporum"
olarak görmüyor. Demo için sorun değil: yarışmacı akışı GARO üzerinden,
hakem/yönetici akışı sekiz rapor üzerinden gösterilir.

### Denetim sonucu

```
KURAL 1 — (takım, yarışma) çifti: 10 · İHLAL: 0  → 0009 uygulanabilir
KURAL 2 — kullanıcı+yarışma çoklu takım: 0
```

Canlı doğrulama: GARO ile ikinci katılım denemesi → **409**
*"Bu yarışmaya takımınız adına zaten bir rapor gönderildi (\"zema\")"*.

## ✅ R-798F26 — 6/6 tamamlandı (25 Ağustos)

| kontrol | karar | skor | not |
|---|---|---|---|
| language_template | fail | 35 | 8 ÖTR bölümünden 4'ü eksik |
| title_content | warn | 65 | **şablon düzeltmesinden ÖNCE koştu** |
| category_fit | fail | — | içerik beyan edilen kategoriyle çelişiyor |
| similarity | pass | 0 | eşik üstü aday yok |
| criteria_scoring | fail | 33 | 6 kriter değerlendirildi |
| feedback_synthesis | pass | — | — |

### "Model Uydu kontaminasyonu" YANLIŞ ALARMDI

Payload'larda "TÜRKSAT", "Model Uydu", "PDR", "İniş Hızı" geçiyor — ama bunlar
şablondan DEĞİL, **raporun kendi içeriğinden** alıntılar. R-798F26 gerçekte
bir Model Uydu PDR raporu (KONRUL takımı, 10. TÜRKSAT 2025) ve 2026 İHA
yarışmasının "Serbest Görev" kategorisine yüklenmiş.

Yani `category_fit`'in `is_consistent: false` demesi **doğru bir bulgu**:
*"Rapor içeriği Türksat Model Uydu Yarışması ve model uydu tasarımına ait
olup, İnsansız Hava Araçları Serbest Görev kategorisi isterleriyle tamamen
çelişmektedir."* Sistem tam olarak yapması gerekeni yaptı.

`language_template` de doğru şablona göre çalıştı: 8 ÖTR bölümü arandı
(33 Model Uydu bölümü değil) ve biçim ölçümü ÖTR kurallarını denetledi
(maks 15 sayfa, Arial 11 pt, "takım adı + sayfa numarası").

**Tek gerçek kalıntı:** `title_content` 24 Ağustos 20:45'te, şablon
düzeltilmeden ÖNCE koştu. Bulgusu raporun kendi başlığıyla ilgili olduğu için
büyük olasılıkla geçerli, ama diğer beş kontrolle aynı bağlamda üretilmedi.
Yeniden koşturmak 1 API çağrısı — kullanıcı kararı.

## 🚦 Katılım kuralı — iki katman (25 Ağustos)

**Katman 1:** bir takım, bir yarışmaya KATEGORİDEN BAĞIMSIZ olarak en fazla
bir kez katılabilir. Kısıt `(team_id, competition_id)` üzerinde —
`category_id` DAHİL DEĞİL. Kategoriyi dahil etseydik "aynı takım üç
kategoriye üç rapor" geçerli olurdu; engellenmek istenen tam olarak bu.

**Katman 2:** bir kullanıcı, bir yarışmada tek takımın üyesi olabilir.
Farklı takım kurarak ikinci kez giremez.

### Uygulama

| yer | ne yapıyor |
|---|---|
| `0009_one_entry_per_team.sql` | `unique (team_id, competition_id)` — **henüz uygulanamadı**, aşağıya bak |
| `findExistingEntry()` | katman 1 kontrolü, `/api/reports` ve `/api/reports/upload-url` |
| `createTeam()` | katman 2 kontrolü — açık hata: *"Bu yarışmaya zaten X takımı ile katıldınız"* |

Kontrol **imzalı URL adımında da** var: yoksa kullanıcı 5 MB'lık dosyayı
Storage'a yükleyip ancak sonraki adımda reddediliyordu.

Katman 2 için DB kısıtı YOK — `team_members × teams` üzerinde trigger
gerektirirdi ve istenen "katılım anında açık hata mesajı" olduğu için
uygulama katmanı seçildi.

Canlı doğrulandı: raporu olan takım → **409** (hem imzalı URL hem multipart),
raporu olmayan takım → **200**, yan etki yok (rapor sayısı 13'te kaldı).

`createTeam` ayrıca düzeltildi: `founded_year` kolonu yokken PostgREST
`42703` DEĞİL **`PGRST204`** dönüyor ("schema cache"), ilk sürüm bunu
kaçırıyordu ve takım oluşturma tamamen hata veriyordu.

### ⚠️ MEVCUT VERİDE İKİ İHLAL — hiçbir şey silinmedi

**İhlal A — GARO takımının 2026'da 5 raporu var.** `0009` bu yüzden
uygulanamıyor (migration çakışmaları listeleyip duruyor, sessizce silmiyor).

| rapor | kategori | analiz | kaynak |
|---|---|---|---|
| R-175C22 Otonom Su Altı Aracı | Serbest Görev | 6/6 | **demo verisi** |
| R-63406F ZEMA | Döner Kanat | 4/6 | kullanıcı testi |
| R-798F26 zema | Serbest Görev | 1/6 | kullanıcı testi (gerçek TEKNOFEST çifti) |
| R-46A803 TESTMM 20-tabloA | Sabit Kanat | 4/6 | asistan testi |
| R-1A98F4 TESTMM 21-tabloB | Sabit Kanat | 4/6 | asistan testi |

Diğer sekiz takımın **birer** raporu var; boş takım yok (VEGA_2026,
ORION_2025, LYRA_2025 yeni açıldı ve raporsuz).

**İhlal B — Mehmet Şahin 2026'da 9 takımın üyesi** (seed böyle kurmuş).
Katman 2'nin DB kısıtı olmadığı için bu hiçbir şeyi bloke etmiyor; yalnızca
kuralla tutarsız bir geçmiş veri.

Seçenekler kullanıcıya sunuldu, karar bekleniyor. Hiçbir veri silinmedi.

## 👤 Ek yarışmacı hesapları (25 Ağustos)

| e-posta | ad | takım | yarışma |
|---|---|---|---|
| `yarismaci@zema.test` | Mehmet Şahin | GARO +8 | 2026 İHA |
| `yarismaci2@zema.test` | Burak Deniz Aslan | VEGA_2026 | 2026 İHA |
| `yarismaci3@zema.test` | Selin Aydın | ORION_2025 | 2025 Model Uydu |
| `yarismaci4@zema.test` | Kerem Doğan | LYRA_2025 | 2025 Model Uydu |

`scripts/seed-competitors.ts` — fikirdeş, katılım kuralına uyuyor.
Rapor OLUŞTURMUYOR: katman 1 bir takıma bir rapor izni veriyor, hangisinin
yükleneceği demo senaryosuna bağlı.

## 👨‍⚖️ Dört hakem + yeniden dağıtım (25 Ağustos)

**Sorun:** Değerlendirme Yöneticisi ekranında 13 raporun hepsi tek hakeme
(Zeynep Demir) atanmış görünüyordu. Ekranda bir hata YOKTU — çoklu hakem
zaten destekleniyordu (hakem yükü tablosu, rapor başına açılır liste,
dengeli dağıtım). Eksik olan **hakemdi**: sistemde tek hakem hesabı vardı.

Eklenen hesaplar (`lib/dev-session.ts` → `EXTRA_JUDGES`, şifre `DEV_PASSWORD`):

| e-posta | ad |
|---|---|
| `hakem@zema.test` | Zeynep Demir *(mevcut)* |
| `hakem2@zema.test` | Mehmet Emre Çelebi |
| `hakem3@zema.test` | Adem Coşar |
| `hakem4@zema.test` | Elif Naz Bozkurt |

`scripts/seed-judges.ts` bunları açıp raporları yeniden dağıtıyor. Ayrı bir
betik: `npm run seed` yarışma/kriter/takım/rapor da üretiyor ve elde bilinçli
bırakılmış test verisi var; bu betik YALNIZCA profiles/auth ve assignments'a
dokunuyor.

Sonuç: 4/3/3/3. **Hakemin üzerinde çalıştığı iki rapor taşınmadı**
(düzenlenmiş kriter metni veya kontrol notu olanlar) — başka hakeme vermek
yarım kalmış işi devretmek olurdu.

### "Dengeli dağıt" düğmesi ölüydü — düzeltildi

`distributeBalanced` yalnızca ATANMAMIŞ raporları dağıtıyordu. Her şey
atanmışken hiçbir şey yapmıyor, düğme tıklanıp sonuçsuz kalıyordu — tek
hakem varken her şey ona yığıldığı için tam olarak bu duruma düşülüyordu.
Artık iki mod var: atanmamış varsa `fill`, yoksa `rebalance` (onay
kutusuyla). Rebalance da hakemin çalıştığı raporu taşımıyor.

## 🔧 Şablon karışıklığı çözüldü — C seçeneği (25 Ağustos)

Model Uydu PDR şablonu yanlışlıkla 2026 İHA yarışmasına uygulanmıştı.
Uygulanan sıra:

1. Aynı PDF depoda **kopyalandı** (kaynak silinmedi) ve 2025 Model Uydu
   yarışmasında işletildi → o yarışma artık gerçek şablonuna sahip.
2. 2026 İHA'da `template_spec.previous` geri yüklendi.

Doğrulama — 9/9 kontrol geçti:

| | 2026 İHA | 2025 Model Uydu |
|---|---|---|
| rapor türü | Ön Tasarım Raporu | Ön Tasarım Gözden Geçirme Raporu |
| bölüm | 8 | 33 |
| maks sayfa | 15 | 120 |
| yazı tipi | Arial 11 pt | (şablonda yok) |
| altbilgi | takım adı + sayfa no | 11.TÜRKSAT … PDR |
| atıf | IEEE | (şablonda yok) |
| kriter | 6 | 0 |

**"İki kuş tek taş" beklentisi yarım karşılandı.** 2025'in şablonu düzeldi
ama **kriter sorunu çözülmedi: Model Uydu PDF'inde puanlama rubriği yok**
(`ÇIKARILAN KRİTER: 0`). Bu, rubriğin ayrı belgede olduğu tezini doğruluyor;
kriterler elle girilmeli — v0.24'teki uyarı ve `CriteriaCard` tam bu iş için.

## 🔍 R-798F26 "SÜRDÜR tamamlamıyor" teşhisi (25 Ağustos)

Mekanik bir engel YOK:

| kontrol | bulgu |
|---|---|
| Düğme render ediliyor mu | ✓ "ANALİZ 1/6 · SÜRDÜR" HTML'de var |
| İşler kapılmış mı | ✗ beş iş `attempts=0`, `started_at=None` — **hiç kapılmamış** |
| `claim_analysis_jobs` | doğru: `status='pending'` olanı FIFO ile kapıyor, rapor filtresi yok |
| `/api/jobs/tick` auth | rota içinde kontrol yok; koruma middleware'de (giriş yeterli) |
| kota/hata izi | yok — hata olsaydı `attempts ≥ 1` olurdu |

Yani düğme "çalışmıyor" değil, **henüz çalıştırılmamış**: v0.24 ile eklendi,
ondan önce ekranda yalnızca salt-okunur bir rozet vardı. `attempts=0` bunun
kanıtı — bir tick dokunmuş olsaydı sayaç artmış olurdu.

Kasıtlı olarak basılmadı: şablon o an hâlâ yanlıştı (Model Uydu) ve
çalıştırmak beş kontrolü yanlış şablona göre değerlendirirdi. Şablon
düzeldikten sonra basmak güvenli.

## ⚠️ ÇALIŞTIRILMASI GEREKEN MIGRATION — `0008_teams_founded_year.sql`

`teams` tablosuna `founded_year int` (NULL kabul) ve 1900-2200 aralık
kısıtı ekliyor. Takım oluşturma formunun ikinci alanı bu.

**Çalıştırılmadan da uygulama çökmüyor:** `createTeam` insert'i `42703`
alırsa kolonsuz tekrar deniyor (0006/0007'deki desenin aynısı), yani takım
yine açılıyor ama kuruluş yılı KAYDEDİLMİYOR.

Mevcut takımlarda (seed'in dokuz takımı dahil) `founded_year` NULL kalıyor
— bilinmiyor, uydurulmadı.

## 🔍 R-798F26 "1/6" ve "0/6 kriter" teşhisi (25 Ağustos)

### Bulgu 1 — altı kontrol ÇALIŞMADI, hâlâ 1/6

```
title_content        done     attempts=1
category_fit         pending  attempts=0
criteria_scoring     pending  attempts=0
feedback_synthesis   pending  attempts=0
language_template    pending  attempts=0
similarity           pending  attempts=0
```

Beş iş `attempts=0` — yani hiç KAPILMAMIŞLAR. Kuyruğu ilerleten tek şey
yükleme formundaki istemci döngüsü (Vercel Cron güvenilmez sayılmıştı);
kullanıcı yükleme bitmeden sayfadan ayrılınca kalan işler orada kalıyor.
`claim_analysis_jobs` doğru çalışıyor, sorun onda değil — **kuyruğu
ilerletecek hiçbir yol yoktu.**

Aynı durumdaki diğer raporlar: R-63406F (4/6), R-46A803 (4/6), R-1A98F4 (4/6).

### Bulgu 2 — "0/6 kriter"in sebebi `template_spec.criteria` DEĞİL

Hipotez doğrulanmadı. Kanıt:

| kontrol | sonuç |
|---|---|
| `criteria_scoring` işi | `pending`, attempts=0 → hiç çalışmadı |
| `ai_criterion_scores` (bu rapor) | **0 satır** — çünkü kontrol çalışmadı |
| 2026 yarışmasının `criteria` tablosu | **6 satır** (K-01…K-06) |
| `run-check` kriterleri nereden okuyor | `criteria` TABLOSU, template_spec'ten DEĞİL |

Yani kriterler tanımlı ve yerinde; "0/6" = 6 kriter var, 0'ı onaylanmış,
çünkü AI hiç kart üretmedi.

**AMA hipotez BAŞKA bir yarışma için doğru:** "TEKNOFEST 2025 — Model Uydu"
yarışmasında `criteria` tablosu **0 satır** ve `template_spec.criteria`
**boş dizi** — şablon PDF'inde rubrik bulunamamış. Bu beklenen bir durum
(rubrik çoğu yarışmada şablondan ayrı belgede) ve o yarışmada gerçekten
kriter yok.

### Düzeltmeler

**a) Takılı kuyruk sürdürülebiliyor.** Hakem ekranındaki salt-okunur
"ANALİZ SÜRÜYOR · 1/6" rozeti düğmeye dönüştü: `resumeAnalysis` failed
işleri pending'e döndürüyor, sonra istemci kuyruğu döndürüyor. Önceki
sürüm yalnızca `failed` işleri kapsıyordu; `pending` takılmayı hiç
çözmüyordu.

**b) Yönetici tarafında boş rubrik uyarısı.** Şablon çözümlendiğinde
rubrik bulunamazsa açık uyarı + "KRİTERLERİ ELLE GİR →" düğmesi.
Yarışmada zaten kriter varsa "mevcut N kritere DOKUNULMADI" deniyor
(rota zaten üzerine yazmıyordu, artık bunu söylüyor da).

**c) Elle kriter giriş ekranı — yoktu, oluşturuldu.** Kriterler yalnızca
şablon çıkarımından yazılabiliyordu. `CriteriaCard` ekle/düzenle/sil
sunuyor; ad biçimi şablon çıkarımıyla aynı (`K-01 · Başlık`) tutuldu ki
hakem ekranı kodu ayraçtan bölebilsin. Silme uyarısı, bağlı AI
skorlarının da gideceğini söylüyor.

**d) Hakem ekranında iki ayrı boş durum.** "0/6" ikisini de gizliyordu:
*"Bu yarışma için henüz puanlama kriteri tanımlanmamış"* (kriter yok) ve
*"N kriter tanımlı ancak değerlendirme henüz çalışmadı"* (kuyruk takılı,
SÜRDÜR düğmesine yönlendiriyor).

## 👥 Takım oluşturma formu — sessiz otomatik açma kaldırıldı (25 Ağustos)

Önceki sürüm, takımı olmayan bir yarışmaya yükleme yapılırken arka planda
sessizce `<Ad Soyad> Takımı` açıyordu. Kullanıcının adına, onayı olmadan ve
adını kendisi seçmeden kayıt yaratmak doğru değil.

Artık `resolveUploaderTeam` takım açmıyor; `needsTeam` ile 409 dönüyor ve
istemci **Takım Oluştur** formunu gösteriyor:

- **Takım Adı** — 3-50 karakter, harf/rakam/tire/alt çizgi.
  Unicode harf sınıfı (`\p{L}`) kullanıldı ki Türkçe harfler geçsin.
  ⚠️ **Boşluk kabul edilmiyor** (istenen kural buydu). Gerçek takım adları
  çoğu zaman boşluk içerir; gerekirse regex'e boşluk eklemek yeterli.
- **Kuruluş Yılı** — zorunlu, bulunduğumuz yıldan büyük olamaz, 1900'den
  küçük olamaz (alt sınır veri girişi hatasını yakalamak için eklendi).

Doğrulama hem istemcide (yazarken görünür) hem sunucuda. Takım kurulana
kadar yükleme alanları gösterilmiyor — aksi halde kullanıcı formu doldurup
409 alırdı. Denetim kaydı: `team.created` + `report.submitted`'daki
`team_created` bayrağı aynen duruyor.

Sunucu tarafı doğrulandı: takımı olmayan yarışmaya hem `/api/reports` hem
`/api/reports/upload-url` **409** dönüyor, sessizce takım **açılmıyor**,
rapor oluşmuyor.

## 🏁 Yarışmacı yeni yarışmaları göremiyordu — teşhis ve düzeltme (25 Ağustos)

### Teşhis: dört hipotezin üçü yanlıştı

| hipotez | sonuç |
|---|---|
| Sorgu sabit bir `competition_id`'ye bağlı | **hayır** — dinamik, ama takımdan türüyordu |
| `competitions` RLS'i yarışmacıyı kısıtlıyor | **hayır** — `competitions_select_all` herkese `using (true)` veriyor |
| Yeni yarışmada eksik bir "status/published" alanı var | **hayır** — tabloda böyle bir kolon HİÇ yok |
| Uygulama katmanı | **EVET** ← kök neden |

`SELECT * FROM competitions` → 2 satır, kolonlar: `id, name, year, language,
template_spec, similarity_threshold, submission_deadline, created_by,
created_at`. Görünürlük/durum alanı yok.

### Kök neden: yarışma TAKIMDAN türüyordu

`loadMySubmissions()` kullanıcının takımlarını çekip **`teams[0]`** alıyor ve
yarışmayı ondan türetiyordu:

```
const team = teams[0];
... .eq('competition_id', team.competition_id)   // kategoriler
```

`resolveUploaderTeam()` de aynısını yapıyordu (`memberships[0]`). Yani
yarışmacı hangi yarışmaya yüklemek isterse istesin **hep rastgele ilk
takımının yarışmasına** yüklüyordu, ve ekranda yalnızca o yarışmayı
görüyordu.

İkinci ve daha derin katman: yeni yarışmanın **hiç takımı yoktu**
(ölçüldü: "TEKNOFEST 2025 — Model Uydu" → 0 takım, 3 kategori).
`reports.team_id` NOT NULL olduğu için, listeyi düzeltmek tek başına
yetmezdi — yarışmacı yönetici kendisine takım açana kadar o yarışmaya
hiç giremezdi.

### Düzeltme

1. `loadMySubmissions()` artık **tüm** yarışmaları kategorileriyle döndürüyor;
   varsayılan seçim kullanıcının takımının olduğu yarışma.
2. Yükleme formuna **yarışma seçici** eklendi; yarışma değişince kategori
   listesi de değişiyor.
3. `resolveUploaderTeam(competitionId)` artık **seçilen yarışmadaki** takımı
   buluyor. Takım yoksa `<Ad Soyad> Takımı` açılıp kullanıcı üye ediliyor.
   Denetim kaydına `team_created: true` yazılıyor.
4. `competition_id` her iki rotaya da (`/api/reports`, `.../upload-url`)
   taşınıyor — imzalı URL'nin yolu doğru takımın klasörü olmalı.

**Takımın otomatik açılması bilinçli bir karar.** Alternatif, yöneticinin
her yarışmacı için elle takım açması; bu doğru "kurumsal" akış ama
yarışmacıyı yönetici müdahalesine kadar kilitliyor. `teams_write_admin`
politikası takım yazmayı yöneticiye kısıtlıyor; rota `service_role`
kullandığı için RLS baypas ediliyor — yetki zaten kontrol edilmiş durumda
(rol = competitor) ve açılan takım yalnızca o kullanıcıya bağlanıyor.

### Doğrulama (gerçek model çağrısı YAPILMADAN, kuyruk tetiklenmedi)

Hiç takımı olmayan "TEKNOFEST 2025 — Model Uydu"ya yükleme yapıldı:
rapor doğru yarışmaya düştü, "Mehmet Şahin Takımı" otomatik açıldı ve
kullanıcı üye edildi, kategori yeni yarışmanınkilerden seçildi, denetim
kaydında `team_created: true`, 2026 yarışmasının 13 raporu bozulmadı.
Test raporu, depo nesnesi ve otomatik takım sonradan silindi.

### Yan gözlem — düzeltilmedi, karar senin

2026 yarışmasının `template_spec.format.footer` alanında *"11.TÜRKSAT Model
Uydu Yarış…"* yazıyor: şablon çıkarımı bir Model Uydu PDF'i ile İHA
yarışmasının üstüne çalıştırılmış görünüyor. Veri karışıklığı, kod hatası
değil. `template_spec.previous` ile geri alınabilir.

## 🟠 T3 Vakfı entegrasyonu — 2. tur (25 Ağustos)

### Ortak `<Header />` — mimari düzeltme

T3 logosu yalnızca `app/page.tsx`'e eklenmişti, yani **kullanıcı giriş
yaptıktan sonra gördüğü hiçbir ekranda T3 aidiyeti yoktu**: hakem inceleme,
yarışma kurulumu, değerlendirme panosu hepsi markasızdı. İç sayfaların hiç
üst çubuğu yoktu, doğrudan `<div className="flex-1">` ile başlıyorlardı.

`components/zema/header.tsx` **kök layout'a** bağlandı — sayfa başına
kopyalanmıyor, dolayısıyla marka bloğu her yerde zorunlu olarak birebir
aynı. Ölçüler tek kaynakta sabit: `MARK_PX=28`, `WORDMARK_PX=20`,
`T3_LOGO_H=40`.

Doğrulandı — 11 sayfada `height:40px` birebir aynı: Ana Sayfa, Giriş/Kayıt,
Gizlilik, Yarışmacı liste, Yükleme, Hakem liste, Hakem İnceleme, Benzerlik
Detayı, Değerlendirme Panosu, Atamalar, Yarışma Kurulumu. `/demo` normal bir
sayfa; tek 404 sebebi `NEXT_PUBLIC_DEMO_MODE` koruması, açıldığında
header'ı kök layout'tan otomatik alıyor.

İki sayfa kendi üst çubuğunu bıraktı: landing'in hero içindeki çubuğu ve
auth'un sağ panelindeki marka bloğu kaldırıldı. Auth `h-screen` yerine
`flex-1` kullanıyor — header üstte yer kapladığı için `h-screen` sayfayı
taşırıyordu.

### Logo %67 büyüdü

T3 logosu 24 px → **40 px** yükseklik (62 px → 104 px genişlik). ZEMA
bloğu (28 px işaret + 20 px kelime ≈ 100 px) ile yan yana dengeli.
"BURSİYER PROGRAMI" etiketi tamamen kaldırıldı.

### T3 renkleri uygulamanın geneline yayıldı

**Rol dağılımı — ZEMA'nın anlam kodlaması korunarak:**

| renk | rol | neden |
|---|---|---|
| teal | AI üretimi / onaylanmamış | değişmedi |
| gold | hakem onaylı | değişmedi |
| **T3 mavisi** | **birincil eylem** (buton, link) | ZEMA'da mavi boştu, hiçbir anlamla çakışmıyor |
| **T3 kırmızısı** | hata / "uygun değil" | `danger` T3 kırmızısına hizalandı |
| **T3 turuncusu** | koyu zeminde vurgu | header rol etiketi, hero etiketi |

**T3 kırmızısı bilinçli olarak birincil butona KONMADI.** Bir hakem
ekranında "kaydet" butonu ile "uygun değil" rozeti aynı renk olurdu — bir
değerlendirme aracında bu gerçek bir karışıklık. Kırmızı yerine `danger`
tokeni T3 kırmızısına çevrildi (`#B4483F` → `#CB241A`); böylece kırmızı da
gerçekten T3 kırmızısı oldu, anlamı bozulmadan. Kontrastı da daha iyi
(canvas 4.97 → 5.14).

Uygulanan: **18 birincil buton** 14 dosyada `bg-ink` → `bg-t3-blue`,
**12 gezinme linki** `text-teal(-ink)` → `text-t3-blue-ink`. Zemin/yüzey
olarak kullanılan `bg-ink` (hero, avatar, ilerleme çubuğu) dokunulmadı.

### Ölçülen renk kısıtları

| kullanım | zemin | oran | karar |
|---|---|---|---|
| T3 Mavi + beyaz metin | buton | 4.52 ✓ | buton zemini olur |
| T3 Mavi metin | canvas | 4.21 ✗ | link için `t3-blue-ink` (#0370A0, 5.11) |
| T3 Kırmızı + beyaz | buton | 5.52 ✓ | |
| T3 Turuncu metin | Ink Navy | 7.54 ✓ | yalnızca koyu zemin |
| T3 Turuncu metin | beyaz | 1.89 ✗ | açık zeminde metin OLARAK KULLANMA |

### WCAG AA taraması — `scripts/aa-scan.py`

Tarama tekrar edilebilir bir betiğe dönüştürüldü (`python3
scripts/aa-scan.py`, çıkış kodu 0/1). Kaynaktaki her `text-*` sınıfı
gerçek sRGB kontrast oranıyla ölçülüyor; zemin, aynı öğedeki `bg-*`
sınıfından, çok satırlı ternary'lerde komşu satırlardan, yoksa bölge
varsayılanından belirleniyor.

**Sonuç: 755 ölçüm, 0 ihlal.** Yol boyunca bulunup düzeltilenler:

- **69 satırda** `text-ink` alfası %75'in altındaydı (en kötüsü %35 →
  2.05:1). Hepsi %75'e (6.15:1) çıkarıldı.
- **5 satırda** koyu zeminde `text-white` alfası %55'in altındaydı
  (%32 → 2.78:1). %62'ye (6.38:1) çıkarıldı.
- **2 satırda** beyaz metin `bg-gold` üstündeydi (2.92:1) → `bg-gold-ink`
  (5.01:1). `/demo` TONE haritası da aynı sebeple düzeltildi.
- `check-panels.tsx`'teki okunabilirlik yorumu bir toplu değiştirmede
  bozulmuştu: *"`text-gold-ink` metin olarak kullanılmaz, metin için
  `text-gold-ink` kullan"* diyordu. Düzeltildi.

Tarayıcının yanlış pozitif ürettiği üç desen ayrıştırıldı: `bg-transparent`
taşıyan ternary dalları, 3 px'lik renk kodu çizgileri, ve nesne
haritalarındaki ayrı `text`/`dot` alanları. Zemini bir değişkenden gelen
iki beyaz metin elle ölçülüp doğrulanmış listeye alındı.

## 🟠 T3 Vakfı görsel entegrasyonu — 1. tur (25 Ağustos)

ZEMA'nın marka sistemi (Ink Navy / Slate Teal / Seal Gold) DEĞİŞMEDİ. T3
aidiyeti ikincil bir katman olarak eklendi.

**Logo:** `/public`'te zaten iki dosya vardı (`t3-vakfi-logo.png` ve
`t3-vakfi-logo-white.png`, v0.5'te eklenmiş) — yeni bir `t3-logo.png`
eklemeye gerek yok, mevcutlar kullanılıyor. Header'da beyaz sürüm, ince
ayraçla ZEMA markasından ayrılmış, yanında `BURSİYER PROGRAMI` etiketi.
Logo zaten "T3 Vakfı" dediği için etiket yalnızca programı adlandırıyor.

**Renk — ölçümle seçildi.** T3'ün dört kurumsal renginden yalnızca turuncu
(#F4B106) alındı, çünkü ZEMA zeminleriyle çalışan tek renk o:

| renk | Ink Navy | beyaz kart |
|---|---|---|
| T3 Kırmızı | 2.58 ✗ | 5.52 ✓ |
| T3 Mavi | 3.15 ✗ | 4.52 ✓ |
| **T3 Turuncu** | **7.54 ✓** | 1.89 ✗ |
| T3 Koyu Gri | 1.44 ✗ | 9.87 ✓ |

Turuncu **yalnızca koyu zeminde metin** olarak kullanılıyor (header etiketi,
7.54:1). Açık zeminli footer'da metin rengi olarak 1.89:1 — kullanılamaz;
orada yalnızca 2 px kenarlık, yani dekoratif ayraç.

Kırmızı ve mavi bilinçli olarak ALINMADI: ZEMA'nın renkleri anlam taşıyor
(teal = AI üretimi, gold = hakem onaylı, danger = uygun değil). Yeni bir
kırmızı/mavi bu kodlamayı bulanıklaştırırdı. T3 KYS'nin "turuncu kart +
sarı buton" tasarım dili de kopyalanmadı.

**"T3 Vakfı Onaylı Platform" ifadesi KULLANILMADI.** Bu, gerçek bir kurumun
onayını iddia eder; ZEMA bir Creathon projesi, T3 Vakfı'nın onayladığı bir
platform değil. Yerine doğrulanabilir ifade kullanıldı: footer'da
"T3 Vakfı Bursiyer Yapay Zeka Creathonu kapsamında geliştirilmiştir."

### Yol boyunca bulunan AA ihlalleri (app/page.tsx)

Önceki kontrast taraması bu dosyayı "koyu zeminli" diye ATLAMIŞTI, oysa
sayfanın büyük kısmı açık zemin. Ölçülüp düzeltildi:

| yer | önce | sonra |
|---|---|---|
| footer şeridi `ink/45` | 2.61 ✗ | `ink/75` 6.15 ✓ |
| kapanış kartı `ink/62` | 4.13 ✗ | `ink/75` 6.15 ✓ |
| adım numarası `ink/22` (26px) | 1.54 ✗ | `ink/55` 3.47 ✓ (büyük metin eşiği 3.0) |
| bölüm etiketleri `text-teal` | 3.97 ✗ | `text-teal-ink` 5.42 ✓ |
| rol kartı etiketi `text-gold`/`text-teal` | 2.92 / 4.26 ✗ | `-ink` 5.01 / 5.81 ✓ |

Hero içindeki `text-gold` (4.87:1) ve `-pale` varyantları koyu zeminde
zaten geçiyor, dokunulmadı.

## ✅ Migration `0007_competitions_created_at.sql` — ÇALIŞTIRILDI (25 Ağustos)

Kullanıcı Supabase SQL Editor'de çalıştırdı, Success. `competitions`'a
`created_at` eklendi; varsayılan yarışma artık "en yüksek yıl" değil
"ilk oluşturulan". `year` yalnızca görüntü verisi.

**Bilinen incelik:** mevcut iki yarışmanın `created_at` değeri BİREBİR AYNI
(migration anında ikisi de `default now()` aldı). Eşitlik durumunda Postgres
satır sırası garanti değil, yani varsayılan yarışma teorik olarak istekler
arasında değişebilir. Şu an doğru yarışmayı (demo) veriyor. Yeni yarışmalar
gerçek `created_at` alacağı için sorun kendiliğinden daralıyor; kalıcı
çözüm gerekirse sıralamaya ikincil anahtar (`id`) eklenir.

## ✅ Prompt yükü temizlendi (25 Ağustos)

`buildCompetitionContext` `template_spec`'i olduğu gibi JSON'a çevirip
sistem talimatına basıyordu. Şablon PDF'inden otomatik çıkarım eklendikten
sonra spec'e üç künye alanı girdi — `source` (çıkarım künyesi),
`source_quotes` (birebir alıntılar) ve `previous` (eski spec'in TAM
KOPYASI). Bunlar yarışma kuralı değil, denetim kaydı; ama HER kontrolün
her çağrısında modele gidiyordu.

Canlı yarışmada ölçüldü: **4.351 → 2.299 bayt (%47 azalma)**. `previous`
ayrıca eski kuralların tam kopyası olduğu için modele ÇELİŞEN iki kural
seti gösteriyordu — asıl sorun bu.

`templateRulesForPrompt()` künye alanlarını süzüyor. Liste bilinçli olarak
KARA LİSTE: `template_spec` yönetici tarafından düzenlenebiliyor ve ileride
gerçek bir kural alanı eklenirse sessizce düşmemeli. Nitekim 2025
yarışmasının spec'inde şablondan çıkarılmış bir `criteria` alanı var ve
korunuyor — izin listesi olsaydı o düşerdi.

## ✅ Başarısız kontroller kurtarılabiliyor (25 Ağustos)

Bir iş 3 denemede başarısız olunca `failed` yazılıyordu ve ORADA KALIYORDU:
kuyruk yalnızca `pending` işleri kapıyor, geri döndürecek yol yoktu.
Hakemin ekranında kalıcı bir "2 KONTROL BAŞARISIZ" rozeti kalıyor, rapor
eksik kontrolle mühürleniyordu.

Sahada görüldü: üç `category_fit` işi bu şekilde kilitlendi (`is_consistent`
alanı gelmemiş). Aynı çağrı sonradan birebir tekrarlandığında sorunsuz
çalıştı — yani hata GEÇİCİYDİ ve kurtarılabilir bir durumdu.

`requeueFailedChecks()` işleri `pending`'e döndürüyor, `attempts`'i
sıfırlıyor ve `created_at`'i öne alıyor (kuyruk FIFO — aksi halde yeniden
denenen iş en arkaya düşerdi). Rozet artık düğme: basınca işler kuyruğa
dönüyor ve kuyruk istemciden döndürülüyor (yükleme formundaki desen).

Yetki `judge` + iki yönetici rolü — `/review/[id]` sayfasının rol
korumasıyla birebir aynı. Hakem kendi raporunu kurtarabilmeli, aksi halde
yönetici beklerdi. Bu bir analiz işlemi, yayımlama değil; §3.1 bozulmuyor.

## ✅ Migration `0006_judge_notes.sql` — ÇALIŞTIRILDI (24 Ağustos)

Kullanıcı Supabase SQL Editor'de çalıştırdı, başarılı. `analysis_results`'a
`judge_note` + `judge_note_at` kolonları ve hakem UPDATE politikası eklendi.
Dört kontrolün hakem geri bildirim metinleri artık gerçekten kaydediliyor.

## 🖼️ Çok-modlu PDF analizi + tablo/görsel benzerliği (24 Ağustos)

PDF artık düz metne ek olarak `inlineData` ile doğrudan Gemini'ye gönderiliyor
(`language_template`, `title_content`, `similarity`, `criteria_scoring`).
Metin de gönderilmeye devam ediyor — kanıt doğrulaması alıntıları
`extracted_text` içinde arıyor, yalnızca görsel katmandan okunan alıntılar
boşluk/ligatür farkı yüzünden birebir eşleşmeyip "uydurma" damgası yerdi.

**Biçim kuralları modele SORULMUYOR, ölçülüyor.** Çok-modlu ilk denemede
model, ölçümle iki tarafa yaslı olduğu kanıtlanmış bir belgeyi "sola hizalı"
diye raporladı. `lib/reports/format-check.ts` yazı tipi (metrik eşlenikleriyle
— LibreOffice'in Arial yerine gömdüğü Liberation Sans dahil), sayfa boyutu,
hizalama (satır sağ kenarı dağılımından) ve altbilgiyi (alt bant, gövde
metninden boşluk oranıyla ayrılmış) PDF'ten doğrudan ölçüyor; sonuç modele
OLGU olarak veriliyor, yeniden değerlendirilmesi istenmiyor.

**Tablo/görsel benzerliği geri geldi** (PLAN.md §4.4'teki kapsam kesintisi
geri alındı — ayrı bir OCR/tablo hattı kurmadan, modelin görme yeteneğiyle).
`similarity_pairs` artık content_type başına (metin/tablo/gorsel) ayrı satır
yazıyor; hakem "metin temiz ama bütçe tablosu aynı" durumunu bağımsız
işaretleyebiliyor. `matched_visuals`'taki `what` alanı BİREBİR ALINTI DEĞİL
— tablonun/şeklin metin karşılığı yok, hakem sayfa numarasından açıp kendi
gözüyle doğruluyor.

⚠️ Dokuz demo raporunun mevcut `analysis_results` satırları bu değişiklikten
ÖNCE üretildi — tablo/görsel karşılaştırması ve biçim ölçümü içermiyorlar.
Yeniden analiz 54 model çağrısı demek; kota nedeniyle demo öncesi
YAPILMAYACAK (bkz. DEMO GÜNÜ KONTROL LİSTESİ). Kod tarafı doğrulandı
(`tsc`, `lint`, `next build` temiz), gerçek Gemini çağrısıyla henüz
ölçülmedi — bu ölçüm §9'daki "prova yüklemesi" adımında yapılmalı.

## 🎨 T3 Vakfı logosu (24 Ağustos)

Ana sayfanın header'ına (koyu zemin, beyaz logo) ve alt bilgi çubuğuna
(açık zemin, renkli logo) resmi T3 Vakfı logosu eklendi. Kaynak: resmi
basın kiti, t3vakfi.org/tr/hakkimizda/kurumsal-kimlik/ üzerinden indirildi.
Dosyalar `public/t3-vakfi-logo.png` (renkli) ve `public/t3-vakfi-logo-white.png`
(beyaz) — orijinal 4390×2481 basın kiti PNG'lerinden kırpılıp 640px genişliğe
küçültüldü. ZEMA'nın kendi marka kimliği (Ink Navy/Teal/Gold) değişmedi.

Kapsam notu: projede rol ekranları (`/review`, `/evaluation`, `/admin`,
`/submissions`) arasında paylaşılan tek bir header bileşeni yok — her sayfa
kendi üst kısmını çiziyor. "Genel header" olarak yalnızca ana sayfanın
(`/`) header'ı var, logo oraya eklendi.

## 🔮 Gelecek sürüm notu

Sistemin gelecek sürümünde, geçmiş onaylı raporlar ve hakem düzeltmeleri
kullanılarak bir dil modelinin ince ayar (fine-tuning) yoluyla eğitilmesi
planlanıyor; zaman kısıtı nedeniyle bu Creathon kapsamında uygulanmadı.
README'ye eklendi (§ Gelecek sürüm); Girişim Sunumu (pptx) yazılırken de
"Sonraki Adımlar" bölümüne bu cümle girmeli.

## 🧩 Şablon PDF'inden otomatik kurulum (madde 3)

Yarışma Yöneticisi artık `template_spec`'i elle doldurmuyor: gerçek şablon
PDF'ini yükleyip **Yükle ve Çözümle**'ye basıyor.

Akış: PDF → imzalı URL ile doğrudan Storage → metin çıkarımı → Gemini
(yapılandırılmış çıktı, `TemplateSpecSchema`) → alıntı doğrulama →
`competitions.template_spec`.

### Uydurma yasağı şemaya gömülü

Yapılandırılmış çıktı modeli HER alanı doldurmaya zorluyor; bu da şablonda
yazmayan kuralı "genelde böyle olur" diye tamamlama riski demek. Yarışma
kuralları uydurulamaz — yönetici şablonda olmayan bir kurala göre yarışma
yapamaz. İki alan bunun için var:

- `not_specified`: şablonda bulunamayan alanların adları. Model boş
  string / 0 bırakıp adı buraya yazıyor, uydurmuyor. Ekranda
  "ŞABLONDA BELİRTİLMEMİŞ" olarak gösteriliyor.
- `source_quotes`: her alanı gerekçelendiren, şablondan BİREBİR alıntı.
  Mevcut `verifyQuotes()` ile şablon metninde aranıyor — kontrollerdeki
  halüsinasyon kalkanının aynısı. Ekranda "9/9 alıntı şablonda birebir
  bulundu" biçiminde görünüyor.

### Geri dönüş garantisi

Yeni spec yazılırken eskisi `template_spec.previous` altına saklanıyor ve
ekranda **ÖNCEKİ ŞABLONA DÖN** düğmesi çıkıyor. Yarışma kuralları tek bir
model çağrısına emanet edilemez. Tek kademe geçmiş tutuluyor
(`previous.previous` siliniyor) — sonsuz yuvalanma olmasın.

### Depolama: migration gerekmedi

Şablonlar `reports` kovasında `_templates/<yarışma_id>/<uuid>.pdf` yolunda.
`0002_rls.sql`'deki yarışmacı politikaları ilk klasör adının UUID olmasını ve
kullanıcının o takımın üyesi olmasını şart koşuyor; `_templates` UUID
regex'ini geçmediği için yarışmacılara **kapalı**. `auth_is_staff()` politikası
personele okuma veriyor — şablon zaten personel belgesi.

### Gerçek şablonla ölçüm (24 Ağustos, MOCK_AI=false)

Gerçek bir TEKNOFEST ÖTR kılavuzu biçiminde 10 bölümlük şablon PDF'i
(Robotaksi ÖTR kuralları) çözümlendi:

- **12/12 alan doğru**: maks 15 sayfa, Arial 11, A4 dikey, iki tarafa yaslı,
  IEEE, altbilgi "takım adı + sayfa numarası", dil `tr`, 10 bölüm eksiksiz,
  başlıklardaki numaralandırma ("2.9.") temizlenmiş.
- **9/9 alıntı birebir doğrulandı**, uydurma yok.
- `not_specified` boş — şablonda her alan gerçekten yazıyordu.

Küçük kusur: "en fazla 15 sayfa" ve "satır aralığı 1,15" hem `format`'ta hem
`content_rules`'ta görünüyor. Tekrar, uydurma değil; `content_rules` serbest
metin olarak prompt'a gidiyor, zarar yok.

### Rota güvenliği (canlı test)

| deneme | sonuç |
|---|---|
| yarışmacı → `template-url` | 403 |
| yarışmacı → `template` | 403 |
| anonim → `template-url` | 307 → `/auth` (middleware) |
| başka yarışmanın klasörüne yol | 403 |
| `..` ile yol atlatma | 403 |
| yönetici → tam akış | 200, spec yazıldı, denetim kaydı düştü |

Geri alma testi: `previous` geri yüklendiğinde spec **birebir** eski haline
döndü, demo verisi bozulmadı.

## 📤 PDF yükleme sağlamlaştırması (madde 2)

### Bulgu: 20 MB ilanı üretimde yalandı

Rota 20 MB sınırı ilan ediyordu ama dosya **kendi API rotamızın istek
gövdesinden** geçiyordu ve Vercel'de serverless fonksiyonların istek gövdesi
**4,5 MB** ile sınırlı. Yani üretimde 5 MB'lık bir ÖTR, platformun kendi
(JSON olmayan) hatasıyla reddedilecekti — üstüne form `await res.json()`
üzerinde throw edip **sonsuza kadar "yükleniyor"da takılacaktı**, kullanıcıya
tek kelime göstermeden.

> Not: bu sınır üretim URL'i kayıtlı olmadığı için canlıda ölçülmedi;
> Vercel'in dokümante ettiği platform sınırıdır. Çözüm sınırı ölçmeye gerek
> bırakmıyor çünkü dosyayı fonksiyon gövdesinden tamamen çıkarıyor.

### Çözüm: tarayıcı → Storage doğrudan yükleme

1. `POST /api/reports/upload-url` imzalı yükleme URL'si üretir. **Yol adı
   istemciden ALINMIYOR**, oturumun takımından türetiliyor — imzalı URL
   yalnızca o takımın klasörüne yazabilir.
2. Tarayıcı dosyayı doğrudan Supabase Storage'a yükler.
3. `POST /api/reports` yalnızca `{file_path, title, category_id}` alır —
   **123 bayt** gövde (test edilen PDF 307 KB idi).

Multipart yolu yedek olarak duruyor (curl testleri, imzalı yükleme
başarısız olursa). Sunucu istemciden gelen yolu ayrıca doğruluyor:
başka takımın klasörü ve `..` atlatması 403.

### Test korpusu — 12 PDF patolojisi, 12/12 doğru

| dosya | beklenen | sonuç |
|---|---|---|
| normal ÖTR (Türkçe + bütçe tablosu) | 200 | 200 · 460 kelime, 371 Türkçe özel karakter, 0 mojibake, `148.500` tablodan okundu |
| 8 sayfa uzun rapor | 200 | 200 · 2028 kelime |
| tablo ağırlıklı (50 satır) | 200 | 200 · hücreler okundu |
| taranmış (metin katmanı yok) | 422 | 422 · "Taranmış (görüntü) PDF olabilir" |
| şifre korumalı | 422 | 422 · Türkçe, eyleme dönük mesaj |
| bozuk (ilk %40) | 422 | 422 |
| PNG, adı `.pdf` | 422 | 422 |
| 0 bayt | 422 | 422 |
| 11 karakter metin | 422 | 422 · "taranmış olabilir" |
| 94 karakter metin | 422 | 422 · "yalnızca 94 karakter çıktı, en az 200 gerekiyor" |
| 31 MB | 413 | 413 |
| `text/plain` içerik türü | 415 | 415 |

### Yol boyunca düzeltilenler

- **pdf.js hataları İngilizce sızıyordu.** "No password given", "Invalid PDF
  structure." kullanıcıya ne yapması gerektiğini anlatmıyor. Bilinen durumlar
  Türkçe ve eyleme dönük mesajla karşılanıyor; tanınmayan hata olduğu gibi
  bırakılıyor (bilgi kaybı yok).
- **"Taranmış görüntü" mesajı yanıltıcıydı.** Geçerli ama kısa bir PDF de aynı
  mesajı alıyordu. Artık 40 karakterin altı "taranmış", üstü "yalnızca N
  karakter çıktı".
- **`await res.json()` çıplaktı** → JSON olmayan yanıtta form sessizce
  kilitleniyordu. `readJson()` ile sarıldı.
- **İstemci tarafı ön kontrol yoktu** — tür/boyut/boşluk sunucuya gitmeden
  söyleniyor.
- **Çıkarım başarısız olduğunda yüklenen nesne Storage'da yetim kalıyordu.**
  Artık siliniyor (test edildi: 8 → 7 nesne).
- **13 yetim depo nesnesi bulundu ve silindi** — önceki geliştirme
  turlarından kalmış, hiçbir `reports` satırı işaret etmiyordu.
  Denetim sorgusu: `reports.file_path` kümesi ile Storage listesini karşılaştır.

## 🔀 Hakem ekranı tek panel

Kriter kartları artık sayfa altında ayrı bir bölüm DEĞİL — "Kriter Bazlı
Değerlendirme" satırının detay açılımının içinde. Sayfada tekrar eden bölüm
kalmadı.

Dört kontrolün (dil/şablon, başlık-içerik, kategori, benzerlik) her birinde
AI analizinin altında düzenlenebilir bir hakem metni var. Ön dolu değer:
sorun yoksa "Bu kriterde eksiklik tespit edilmedi.", varsa AI çıktısından
türetilmiş öneri. `analysis_results.judge_note`'a kaydediliyor — modelin
`payload`'ına DOKUNMUYOR, "AI ne dedi / hakem ne dedi" ayrımı korunuyor.

"Yarışmacı Geri Bildirimi" paneli bu dört metni ve kriter kartlarının
onaylanan metinlerini otomatik derliyor (`compileFeedback`). "Bu kriterde
eksiklik tespit edilmedi." maddeleri güçlü yön sayılmıyor, atlanıyor.

**⚠️ ROL AYRIMI GERİLİMİ:** İstek "hakem ... yayımlasın" diyordu, ama §3.1
matrisi feedback için "Değ. Yöneticisi CRUD + publish" diyor ve bu ayrım
önceki turda açıkça talep edildi. Uygulanan çözüm: hakemin butonu
**"Onayla ve Yayıma Gönder"** — taslağı kesinleştirip `feedback` satırına
`is_published=false` yazıyor ve raporu `under_review` yapıyor. Yayımlama
Değerlendirme Yöneticisi ekranında tek tık. Hakemin doğrudan yayımlaması
isteniyorsa `submitFeedbackDraft` yerine `publishFeedback` çağrılması
yeterli (tek satır) — ama bu §3.1'i ihlal eder.

## 📄 Rapor şablonu — kaynak ve kapsam

Rapor türü TEKNOFEST'in genelinde kullanılan gerçek terim olan **"Ön Tasarım
Raporu" (ÖTR)** ile tutarlı tutuldu. Format kuralları ve bölüm listesi,
TEKNOFEST'in farklı yarışmalarındaki (Roket, Sürü İHA) yayımlanmış ÖTR
şablonlarından çapraz doğrulanarak alındı. Tek gerçek eksik olan **"Risk
Değerlendirmesi"** bölümü eklendi.

Demo odağı: İnsansız Hava Araçları / Serbest Görev.

`competitions.template_spec` (DB'de canlı):

- **8 zorunlu bölüm:** Problem Tanımı · Literatür Taraması · Yöntem ve Sistem
  Mimarisi · Test ve Doğrulama · Zaman Planı ve Bütçe · **Risk
  Değerlendirmesi** · Sonuç · Kaynakça
- **format:** Arial 11 pt · A4 dikey · iki tarafa yaslı · maks. 15 sayfa ·
  altbilgide takım adı + sayfa numarası
- **içerik kuralları:** genel/literatür bilgisi yerine özgün yenilik vurgusu;
  tekrarlayan cümle tespiti
- **atıf:** IEEE

⚠️ Dokuz demo raporu bu bölüm eklenmeden ÖNCE üretildi, dolayısıyla hepsinde
"Risk Değerlendirmesi" eksik görünüyor. Bu bilinçli bir durum: şablon
kontrolünün sistematik bir eksiği yakaladığını gösteriyor. Referans rapor
(ATMACA) yine de %85 ile `UYGUN` kalıyor. Raporları bu bölümle yeniden
üretmek 54 model çağrısı demek; kota nedeniyle yapılmadı.

## 🎨 Okunabilirlik kuralları (ölçülerek belirlendi)

WCAG kontrast oranları hesaplandı, tahmin edilmedi. Ink Navy #1B2A4A metin,
#FFFFFF ve #F7F7F5 zeminler üzerinde:

| alfa | kontrast | sonuç |
|---|---|---|
| %50 | 2.98:1 | **AA başarısız** |
| %65 | 4.51:1 | sınırda |
| **%75** | **6.15:1** | AA geçer |
| %85 | 8.41:1 | rahat geçer |

**Kritik bulgu:** `text-gold` (#C98A3E) tam opaklıkta **2.92:1** — AA'yı ağır
şekilde geçemiyor. `text-teal` (#4C8577) 4.26:1 ile sınırda. İkisi de metin
rengi olarak kullanılıyordu. Artık:

- metin için `text-gold-ink` (5.01:1) ve `text-teal-ink` (5.81:1)
- gold/teal yalnızca kenarlık ve zemin olarak
- Ink Navy metin en az **%75** alfa
- gövde metni **14px / satır yüksekliği 1.6+**; 1.3-1.4 yalnızca başlıkta
- paragraf yerine madde listesi

Açık zeminli 17 dosyada uygulandı, kalan ihlal 0.

**Kriter kartı tam üç görsel kat:** (1) AI değerlendirmesi — nötr zemin,
(2) kanıt — sol teal kenarlık + hafif teal zemin (12.7:1), (3) hakem metni —
gold kenarlıklı ayrı kart. "Beklenti" kat değil, başlık altında tek satır
rubrik referansı.

## 📊 Karar eşikleri

Sayısal skor üreten kontrollerin kararı artık `SCORE_THRESHOLDS`
sabitinden deterministik olarak türetiliyor — modelin kendi `verdict`
alanından değil:

| skor | karar |
|---|---|
| %75 ve üzeri | UYGUN |
| %50–74 | DİKKAT |
| %50 altı | UYGUN DEĞİL |

`insufficient_evidence` skordan bağımsızdır ve her zaman korunur.

Kontroller iki gruba ayrıldı (`CHECK_SCORING`):

- **numeric** — dil/şablon, başlık-içerik, kriter puanlaması. Yüzde gösterilir,
  karar eşikten gelir.
- **judgment** — kategori uygunluğu, benzerlik, geri bildirim. Yapay yüzde
  UYDURULMAZ; karar modelin kendi yargısıdır. (Benzerlik yüzdesi gösterilir
  ama o gerçek bir ölçüm, uyum skoru değil — eşiğe vurulmaz.)
- Geri bildirim sentezi bir kapı olmadığı için rozeti `HAZIR`, `UYGUN` değil.

Her rozetin `title` açıklaması var; kapalı panelde de HTML'de bulunuyor.

## ✅ KRİTİK YOL — 24 Ağustos'ta açıldı, 24 Ağustos'ta kapandı

Kod tarafı teslim edilebilir durumda. Kod dışı iki zorunlu çıktı —
**İş Modeli Canvası** (9 kutu) ve **Girişim Sunumu** (pptx: Problem → Çözüm
→ Nasıl Çalışır → Farklılaşma → Etki → Ekip → Sonraki Adımlar) — bu reponun
DIŞINDA, ayrı bir Claude sohbetinde hazırlandı (kullanıcı onayı, 24 Ağustos).
Bu repoda dosyaları yok; bu bilinçli bir ayrım, §7'nin "paralel ilerleyen,
kod dışı teslimat" ayrımıyla tutarlı.

26 Ağustos 10:00'da istenen üç çıktının (§7) üçü de artık karşılanıyor:
canlıda çalışan uygulama ✅, İş Modeli Canvası ✅ (repo dışı), Girişim
Sunumu ✅ (repo dışı). Ölçülmüş sayılar sunuma malzeme olarak kullanıldı:
57/57 kanıt doğrulama, 54 kontrol, 9 rapor, 0 uydurma.

- [ ] **README — TODO, en son yapılacak.** Teslimden hemen önce, projenin
      son haliyle ekran görüntüleri eklenerek güncellenecek. Şimdiden
      yapılmadı — bilinçli bir sıralama kararı (proje hâlâ değişiyor,
      ekran görüntüsü erken çekilirse bayatlar).

## 📋 Eski sıra (tamamlandı)

Sıralama gerekçesi: §9'daki demo zinciri şu an **iki yerde kopuk**. Auth bir
güvenlik açığı ama demoyu bozmuyor; kopuk halkalar bozuyor.

**Auth aynı gün yapılacak, yarına bırakılmayacak.** Gerekçe: RLS ilk kez
gerçekten devreye girdiğinde (şu an `service_role` ile baypas ediliyor)
beklenmedik erişim hataları çıkması muhtemel. Bunları çözmek için tampon
süre gerekiyor; son güne bırakılamaz.

1. **`/evaluation/feedback/[id]` — yayımlama akışı.** `feedback` satırı
   `is_published=false` olarak yazılıyor ve onu yayımlayacak hiçbir şey yok.
   Yani yarışmacı ekranı KALICI olarak boş. §9 adım 5 imkânsız. *Küçük iş.*
2. **`/submissions` + `/submissions/new` — yükleme arayüzü.** Rapor yükleme
   yalnızca `curl` ile çalışıyor. §9 adım 2 imkânsız. *Küçük iş.*
3. **Auth — TAM KAPSAM.** PLAN'da Gün 1 işi, gecikti. Detay aşağıda.
   *Büyük iş, ama bölünmez.*

Bunlardan sonra sırada: `/evaluation/assignments` (atama), `/admin/criteria`
ve `/admin/categories` (§8 kesme listesi 6: seed SQL ile yönetilebilir),
`/evaluation/calibration` (§8 kesme listesi 5: basit tablo yeter).

## ✅ Auth — TAMAMLANDI (23 Ağustos)

Tam kapsam yapıldı, yedek plana düşülmedi:

- `lib/supabase/server.ts` — cookie tabanlı oturumlu istemci + `currentUser()`
- `middleware.ts` — oturum yenileme + korumalı rota yönlendirmesi.
  `/api/jobs/tick` dahil, yani anonim kota tüketimi artık mümkün değil.
- Kayıt kodu ile rol atama (§3.2): kodlar yalnızca sunucuda okunuyor,
  istemciye sadece rolün ADI dönüyor. Kod yoksa `competitor`.
- KVKK onayı olmadan kayıt tamamlanmıyor (`kvkk_consent_at`).
- Role göre yönlendirme (`ROLE_HOME`) + sayfa seviyesinde `requireRole()`.
- **`lib/reports/queries.ts` artık oturumlu istemci kullanıyor → RLS gerçekten
  devrede.** Admin istemcisi yalnızca sistem işlerinde (job runner, rol atama,
  seed, storage yazımı).
- Dört rol de seed'lendi; şifre `zema-test-2026`.

Gerçek girişlerle doğrulandı:

| | /review | /evaluation | /admin | /submissions |
|---|---|---|---|---|
| Yarışmacı | → /submissions | → /submissions | → /submissions | **200** |
| Hakem | **200** | → /review | → /review | → /review |
| Değ. Yön. | **200** | **200** | → /evaluation | → /evaluation |
| Yarışma Yön. | **200** | **200** | **200** | → /admin |

Veri düzeyinde: anonim her tabloda 0 satır · yarışmacı `ai_criterion_scores`
0 satır (ham AI analizi gizli) · yarışmacının UPDATE denemesi 0 satır etkiledi
ve hiçbir veriyi değiştirmedi · hakem yalnızca ATANDIĞI raporu görüyor.

### Action yetkilendirmesi — KAPATILDI (23 Ağustos)

Sekiz mutasyon action'ının hepsinde `authorize()` var. Hakem action'larında
ayrıca `assertReportAccess()`: hakem A, hakem B'nin raporunu mühürleyemez.
Aktör artık oturumdan alınıyor (önce "herhangi bir hakem" sorgulanıyordu).

Gerçek exploit denemesiyle doğrulandı: yarışmacı oturumuyla Next.js action
protokolü üzerinden `publishFeedback` çağrıldı → üç action da
"yetkiniz yok (rolünüz: YARIŞMACI)" döndü, DB değişmedi.

### Auth sonrası kalan açıklar

- [x] ~~`/evaluation/assignments`~~ — yapıldı. Manuel atama + "dengeli dağıt".
      Seed hâlâ ilk atamayı yapıyor (boş DB'de hakem ekranı boş kalmasın).


## ✅ Kozmetik cila — TAMAMLANDI (24 Ağustos)

- [x] Ana sayfa üst menüsü: "Nasıl Çalışır" ve "Roller" artık çalışan sayfa
      içi çapa linkleri. "İletişim" kaldırıldı — verilecek bir iletişim
      bilgisi yoktu ve ölü link jüriye kötü görünür. Ayrıca yeni bir
      "Roller" bölümü eklendi: şartnamenin dört rol gereksinimini ve her
      rolün kayıt koduyla mı açıldığını doğrudan gösteriyor.
- [x] Placeholder kontrastı: `placeholder:text-ink/40` eklendi ve "Ad Soyad"
      ipucu jenerikleştirildi ("Adınız ve soyadınız"). Tailwind v4 preflight
      placeholder'ı currentColor'ın %50'si yapıyor; Ink Navy üzerinde bu
      fazla koyu kalıyor ve ipucu dolu bir DEĞER gibi okunuyordu.

## 📅 Gelecek geliştirme — 5-6 Eylül'e bırakıldı

- **Google ile giriş (OAuth).** Bilinçli olarak ŞİMDİ eklenmiyor. İki gerekçe:
  (1) dış OAuth kurulumu (Google Cloud konsolu, redirect URI, onay ekranı)
  teslime iki gün kalırken zaman riski taşıyor; (2) bugün sağlamlaştırılan
  kayıt kodu ile rol atama akışına, test edilmemiş ikinci bir kullanıcı
  oluşturma yolu açıyor — OAuth'la gelen kullanıcının rolü nasıl atanacak
  sorusu ayrıca tasarım gerektiriyor. Finale kalınırsa Demo Day öncesi
  eklenebilir.

## ✂️ Eklenmeyecek — karar verildi

- **Demo sırasında canlı rapor yükleme.** Production'da `MOCK_AI=true`
  kalıyor; canlı yükleme fixture çıktısı üretir. Dokuz rapor gerçek Gemini
  analizinden geçmiş, DB'de hazır. PLAN.md §9 buna göre güncellendi.

- **§9 adım 4, AI vs Hakem kalibrasyon tablosu.** §8 kesme listesinde 5.
  sıradaydı. İki gün kaldığı ve demo senaryosu bu adım olmadan da güçlü
  olduğu için ATLANDI. Demo anlatısından da çıkarılmalı.

---

## 🔧 Gün 3 — AI hattı

- [ ] **Örtük önbellek gerçekten çalışıyor mu?** İlk çağrıda
      `cached_input_tokens: 0` çıktı (girdi 415 token, eşiğin çok altında).
      Gerçek 20 sayfalık raporlarda (12–15k token) bu alanı izle. Tutmuyorsa
      §5.1'deki istek sırası bozuluyor demektir.

- [ ] **`thinkingLevel: MINIMAL` model-bağımlı.** `gemini-3.5-flash`'ta
      çalışıyor, `gemini-3.7-flash` 400 veriyor. Model değişirse
      `lib/ai/config.ts`'teki `THINKING_LEVEL` tablosu yeniden doğrulanmalı.

---

## 🗄️ Gün 2–6 — veri katmanı


## 🚀 DEMO GÜNÜ KONTROL LİSTESİ

**Canlı yükleme demoda OLACAK** — gerçek hakemler yeni bir rapor yükleyip
gerçek AI analizini görecek. Bunun için `MOCK_AI=false` gerekiyor ve bu
adım UNUTULURSA jüri yer tutucu metin görür.

### Prova sırasında, sırayla

- [ ] **1. Kuyruğun boş olduğunu doğrula.**
      `analysis_jobs` içinde `pending`/`running` iş kalmamalı. Kalırsa yeni
      yüklemenin ilerleme çubuğu FIFO gereği önce onları bekler ve 0/6'da
      takılı görünür.
- [ ] **2. Vercel'de `MOCK_AI=false` yap** → Environment Variables → Production.
- [ ] **3. REDEPLOY et.** Env değişikliği tek başına yetmez.
- [ ] **4. Prova yüklemesi yap** ve altı kontrolün gerçek modelle bittiğini gör.
      Yüklediğin prova raporunu demo öncesi SİL (kuyruk temiz kalsın).
- [ ] **5. Kota kontrolü:** prova 6 istek harcadı. Ücretsiz katman model
      başına günde 20 istek veriyor; zincir üç modele yayıldığı için
      (`gemini-3.5-flash → 3.5-flash-lite → 3.7-flash`) toplam ~60 istek
      var. Yine de demo öncesi başka analiz çalıştırma.
- [ ] **6. Demo sonrası `MOCK_AI=true`'ya dön** ve redeploy et.

### Neden bu kadar dikkat gerekiyor

Mock modda tick çalıştırmak gerçek analiz sonuçlarını fixture ile eziyordu.
**Artık kalıcı koruma var:** mock sonuç, gerçek bir modelden gelen sonucun
üstüne yazılmıyor (`run-check.ts`). Yani en kötü senaryoda yeni yükleme
fixture alır, mevcut dokuz raporun verisi bozulmaz.

### Kota güvenliği — İKİ BOYUTLU fallback (model × anahtar)

Ücretsiz katman kotası **proje × model başına günde 20 istek**. Dokuz raporun
altı kontrolü 54 çağrı demek, yani tek anahtar tek gün için yetmiyor.

`callModelForCheck` artık iki boyutta düşüyor. Deneme sırası **model-baskın**:

```
flash/#1 → flash/#2 → flash/#3 → flash-lite/#1 → … → 3.7-flash/#3
```

Yani bir modelin kotası bir anahtarda dolduğunda ÖNCE diğer anahtarlar
denenir, daha zayıf modele düşmek son çaredir — analiz kalitesi korunur.

- Anahtarlar: `GOOGLE_API_KEY`, sonra `GOOGLE_API_KEY_1..10`. Tekrarlananlar
  ve boşluklu değerler ayıklanır.
- **Anahtarlar farklı AI Studio PROJELERİNDEN olmalı.** Aynı projeden ikinci
  anahtar üretmek kotayı artırmaz — kota projeye bağlı.
  N proje × 3 model × 20 istek/gün. **25 Ağustos itibarıyla 4 anahtar
  doğrulandı → 240 istek/gün.**
- 429 alan (model, anahtar) çifti bir süre "soğumaya" alınır ki sonraki
  kontroller aynı doomed çağrıyı tekrarlamasın. Soğuma çifti ELEMEZ,
  listenin sonuna atar — kota gece yarısı sıfırlanırken süreç ayakta
  kalabileceği için bellekteki işaret bayat olabilir.
- Geçersiz anahtar (400 `API_KEY_INVALID`) tüm modeller için elenir.
  Bu olmasa `.env`'e yanlış yapıştırılmış tek bir anahtar bütün zinciri
  düşürürdü — 400 normalde fallthrough etmiyor.
- **Log'a anahtar DEĞERİ hiç yazılmaz**, yalnızca sıra numarası (`anahtar #2`).

### 403 zinciri kesiyordu — düzeltildi (25 Ağustos)

Üçüncü/dördüncü anahtar eklenirken ortaya çıktı. Yeni anahtarlardan biri
`models.list()`'te **403** verdi: *"Gemini API has not been used in project
1014944337025 before or it is disabled."* Birkaç dakika sonra kendiliğinden
düzeldi — yeni etkinleştirilen API'nin yayılması.

Ama 403 fallthrough listesinde DEĞİLDİ (`429 || 404 || badKey`), yani zinciri
**olduğu yerde kesiyordu**. Dört anahtarlı havuzda ilk üçü 429 alıp
dördüncüsü 403 verdiğinde çağrı tamamen başarısız oluyor, oysa zincirdeki
diğer iki modelin ilk üç anahtardaki kotası hiç denenmemiş oluyordu.

Düzeltme: 403 anahtara özgü sayılıyor (projede API etkin değil, anahtar
kısıtlı, faturalandırma engeli — hepsi başka anahtarla çalışır) ve zincir
devam ediyor. Soğuma **15 dakika**, kalıcı değil: 403 geçiciydi ve anahtarı
bir yıllığına elemek iki dakika sonra geçerli olacak bir anahtarı kaybetmek
olurdu. 400 `API_KEY_INVALID` için kalıcı eleme aynen duruyor.

Test: dört hata sınıfının dördü de doğru karar veriyor (429/400-anahtar/403
devam eder, 400-şema keser); 403 senaryosunda zincir `flash-lite`'a geçiyor
ve 12 çiftin 6'sı hâlâ denenebilir kalıyor.

### Anahtar sayımında iki tuzak

1. `env | grep -c '^GOOGLE_API_KEY'` **yanlış sayar** — boş slotları da sayar.
   `keyCount()` veya değer uzunluğu kontrolü kullan.
2. Anahtar dizelerinin farklı olması **ayrı proje demek değildir**. Aynı
   projeden üretilen iki anahtar aynı kotayı paylaşır ve havuz bunu tespit
   edemez. Kapasite iddiası ancak projelerin ayrı olduğu AI Studio'dan
   doğrulanırsa geçerli.
3. Çalışan `next dev` sunucusu `.env.local` değişikliğini görmez —
   yeni anahtar eklendikten sonra **yeniden başlatmak** gerekir.

Canlı doğrulandı (24 Ağustos): #1 kasten bozuk anahtar + #2 gerçek anahtar
ile çağrı yapıldı; #1 reddedilip üç modelden de elendi, yanıt **en iyi
modelden** (`gemini-3.5-flash`) 2. anahtarla alındı.

### Diğer kurallar

- `NEXT_PUBLIC_DEMO_MODE=true` kalıyor — `/demo` rol geçişinin tek yolu.
- Kalibrasyon panosu senaryodan çıkarıldı.

- **Canlı yükleme yok** (PLAN §9). `MOCK_AI=true` kalıyor.
- **Kota: proje × model başına günde 20 istek.** Demo öncesi 2-3 AI Studio
  projesinden anahtar üretip `GOOGLE_API_KEY_1..10`'a Vercel'de de ekle.
- `NEXT_PUBLIC_DEMO_MODE=true` kalıyor — `/demo` rol geçişinin tek yolu.
  Auth bağlandı ama rol başına ayrı giriş yapmak demoyu yavaşlatır.

- [ ] **Canlıda Türkçe glifleri gözle kontrol et** (ş ğ ı İ ç ö ü).
      `latin-ext` alt kümesi eklendi ama üretimde doğrulanmadı.

---

## ⚖️ Hukuki / uyum

- [x] **KVKK metnindeki boş alanlar dolduruldu (24 Ağustos, kullanıcı).**
      `app/gizlilik/page.tsx`, m.10 kontrol listesine göre yazılmıştı (10
      bölüm). Üç alan artık gerçek değerle dolu: veri sorumlusu adı, adres,
      iletişim e-postası (iki yerde). Küçük gözlem: alanlar hâlâ köşeli
      parantez İÇİNDE gösteriliyor (ör. "[Hatice Zeynep Demir]") — bu
      görsel biçim placeholder izlenimi verebilir, istenirse parantezler
      kaldırılabilir (kozmetik, kullanıcı kararı).
      Metin hâlâ hukukçu onayından GEÇMEDİ; yapılan iş m.10/m.11
      unsurlarını eksiksiz hale getirmekti, hukuki mütalaa değil.

---

## 🧹 Temizlik (isteğe bağlı)

- [ ] **`lib/ai/call-claude-for-check.ts` adı yanıltıcı** — içinde
      `callModelForCheck()` var ve Gemini çağırıyor. `git mv` tek satır.

- [ ] **Tasarımdan kasıtlı alınmayanlar** — geri isteniyorsa:
      "TASARIM ÖNİZLEME" üst navigasyonu ve kayıt ekranındaki
      "KAYIT KODU ALANI · DURUM KARŞILAŞTIRMASI" paneli. İkisi de canvas
      scaffolding'i / tasarımcı notu olduğu için alınmadı.

- [ ] **`@anthropic-ai/sdk` paketi kurulu ama kullanılmıyor.** Sağlayıcı geri
      alınabilsin diye bırakıldı; hiçbir yerden import edilmediği için
      bundle'a girmiyor. Kalıcı karar verilince kaldırılabilir.
