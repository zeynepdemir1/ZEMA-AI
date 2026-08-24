# ZEMA — Yapılacaklar / Bilinen Eksikler

## ⚠️ ÇALIŞTIRILMASI GEREKEN MIGRATION — `0007_competitions_created_at.sql`

**Neden gerekli — gerçek bir kullanıcı hatası bunu ortaya çıkardı (25
Ağustos):** Yarışma Yöneticisi "Yarışma Bilgileri" formuna yeni bir ad/yıl
yazıp YENİ bir yarışma oluşturduğunu sandı; form aslında var olan TEK
satırı yerinde güncelliyordu (`saveCompetitionInfo` bir `UPDATE`). Demo
yarışmasının kimliği ("TEKNOFEST 2026 — İnsansız Hava Araçları") üzerine
yazıldı; kategoriler `competition_id` ile ona bağlı kaldığı için "eski
kategoriler yeni yarışmada görünüyor" gibi göründü. **Kimlik geri
yüklendi** (bilinen doğru değerle, `lib/dev-session.ts`'teki
`DEV_COMPETITION_NAME`'den — tahmin değil), ama kök sebep — birden fazla
yarışmayı ayırt edecek bir kolon yokluğu — çözülmedi.

Bu migration `competitions`'a `created_at timestamptz default now()`
ekliyor. `loadSetup`/`loadDashboard`/`loadAssignments` artık "en yüksek
yıl" yerine "ilk oluşturulan" yarışmayı varsayılan alıyor — `year` artık
yalnızca görüntü verisi, seçim anahtarı değil. **Çalıştırılmadan da
uygulama çökmüyor** — kod kolon yokluğunu yakalayıp eski `year desc`
davranışına düşüyor (0006'daki "kolon yokluğunu yakala" deseniyle aynı,
test edildi). Ama çalıştırılana kadar yeni yarışma oluşturma özelliği
`/evaluation` ve `/evaluation/assignments`'ı etkilemeyecek şekilde
GÜVENDE kalıyor — o ekranlara henüz yarışma seçici eklenmedi, bilinçli
olarak hep ilk (demo) yarışmayı göstermeye devam ediyorlar.

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
  3 proje × 3 model × 20 = **180 istek/gün**.
- 429 alan (model, anahtar) çifti bir süre "soğumaya" alınır ki sonraki
  kontroller aynı doomed çağrıyı tekrarlamasın. Soğuma çifti ELEMEZ,
  listenin sonuna atar — kota gece yarısı sıfırlanırken süreç ayakta
  kalabileceği için bellekteki işaret bayat olabilir.
- Geçersiz anahtar (400 `API_KEY_INVALID`) tüm modeller için elenir.
  Bu olmasa `.env`'e yanlış yapıştırılmış tek bir anahtar bütün zinciri
  düşürürdü — 400 normalde fallthrough etmiyor.
- **Log'a anahtar DEĞERİ hiç yazılmaz**, yalnızca sıra numarası (`anahtar #2`).

Canlı doğrulandı (24 Ağustos): #1 kasten bozuk anahtar + #2 gerçek anahtar
ile çağrı yapıldı; #1 reddedilip üç modelden de elendi, yanıt **en iyi
modelden** (`gemini-3.5-flash`) 2. anahtarla alındı.

### Diğer kurallar

- `NEXT_PUBLIC_DEMO_MODE=true` kalıyor — `/demo` rol geçişinin tek yolu.
- Kalibrasyon panosu senaryodan çıkarıldı.

- **Canlı yükleme yok** (PLAN §9). `MOCK_AI=true` kalıyor.
- **Kota: proje × model başına günde 20 istek.** Demo öncesi 2-3 AI Studio
  projesinden anahtar üretip `GOOGLE_API_KEY_1..3`'e Vercel'de de ekle.
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
