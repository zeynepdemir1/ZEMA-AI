# ZEMA

**TEKNOFEST rapor değerlendirmelerini destekleyen AI sistemi.**
T3 Vakfı Bursiyer Yapay Zeka Creathonu — Problem 4.

> **AI karar vermez, hakemi hızlandırır.**
> Her AI çıktısı bir *öneri*dir. Hakem onaylar, düzenler veya reddeder.
> Onaylanmayan hiçbir metin yarışmacıya ulaşmaz.

---

## Ne yapıyor

Bir rapor yüklendiğinde altı kontrol otomatik çalışır:

| Kontrol | Ne bakıyor |
|---|---|
| `language_template` | Dil kalitesi + şablonun zorunlu bölümleri gerçekten dolu mu |
| `title_content` | Başlığın vaat ettiği ile içeriğin örtüşmesi |
| `category_fit` | Beyan edilen kategori içerikle uyumlu mu |
| `similarity` | Diğer raporlarla metin örtüşmesi (iki aşamalı: trigram → model) |
| `criteria_scoring` | Rubrik bazlı, kanıt alıntılı kriter değerlendirmesi |
| `feedback_synthesis` | Yarışmacıya gidecek yapıcı geri bildirim (puan sızdırmadan) |

Sonuçlar hakeme *taslak* olarak gösterilir. Hakem her kriteri düzenleyip
mühürler; Değerlendirme Yöneticisi geri bildirimi yayımlar; yarışmacı yalnızca
yayımlanan sürümü görür.

## Halüsinasyona karşı ne yapıyor

Modelin verdiği her kanıt alıntısı, rapor metninde **birebir** geçtiği kodla
doğrulanır. Üç sonuç ayırt edilir:

- **birebir bulundu** → kanıt geçerli
- **yalnızca diyakritikler katlanınca bulundu** → alıntı doğru ama yazım bozuk
- **bulunamadı** → kırmızı rozet, ve o kriterin `confidence` değeri düşürülür

Alıntı hiç verilmemişse ceza yoktur — model kanıt gösteremediğini dürüstçe
bildirmiş olabilir. Ceza, kanıt *iddia edip* doğrulanamayana verilir.

Dokuz raporluk demo veri setinde ölçülen sonuç: **57 alıntının 57'si birebir
doğrulandı, 0 uydurma.**

## Mimari

```
Yarışmacı → PDF → Supabase Storage
                       │  unpdf ile metin çıkarımı
                       ▼
              reports · analysis_jobs (6 satır)
                       │
        POST /api/jobs/tick  ← client polling
        claim_analysis_jobs() · FOR UPDATE SKIP LOCKED
                       │  her iş = 1 model çağrısı
                       ▼
     analysis_results · ai_criterion_scores · similarity_pairs
                       │
     Hakem paneli   Değ. Yön. panosu   Yarışmacı geri bildirimi
```

**Neden kuyruk:** Altı kontrolü tek HTTP isteğinde çalıştırmak serverless süre
limitine takılır. Kuyruk ayrıca *kısmi sonuç* sağlıyor — üç kontrol bitince
hakem onları görmeye başlıyor. `SKIP LOCKED` iki eşzamanlı tick'in aynı işi
iki kez çalıştırmasını (ve iki kez kota harcamasını) engelliyor.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres/Auth/Storage) ·
Google Gemini API · Vercel · Tailwind v4 + shadcn/ui

## Güvenlik modeli

Erişim kontrolü **Postgres tarafında RLS ile** uygulanıyor, uygulama katmanında
filtreleme ile değil. Bir kullanıcının görmemesi gereken satır sorgudan hiç
dönmüyor.

- **Yarışmacı** ham AI analizini göremez (`analysis_results`,
  `ai_criterion_scores` → 0 satır). Yalnızca yayımlanmış `feedback` satırı.
- **Hakem** yalnızca kendisine *atanmış* raporu görür ve yalnızca ona müdahale
  edebilir.
- **Yayımlama** yetkisi tek roldedir: Değerlendirme Yöneticisi.
- Mutasyon yapan on iki server action'ın hepsinde rol kontrolü var — bir kısmı
  `service_role` kullandığı için RLS orada kalkan değil.
- Roller kayıt ekranında **seçilmez**. Yarışmacı serbest kaydolur; diğer üç rol
  yalnızca doğru kayıt koduyla açılır. Kodlar sunucuda kalır, istemciye
  yalnızca atanacak rolün *adı* döner.

## Kurulum

```bash
npm install
cp .env.example .env.local     # değerleri doldur (aşağıya bak)
```

Supabase SQL Editor'de sırayla çalıştır:

```
supabase/migrations/0001_init.sql        şema (16 tablo, 8 enum)
supabase/migrations/0002_rls.sql         49 RLS politikası, 5 yardımcı fonksiyon
supabase/migrations/0003_grants.sql      API rollerine GRANT + RLS güvenlik kilidi
supabase/migrations/0004_claim_jobs.sql  kuyruk ve benzerlik ön eleme fonksiyonları
supabase/migrations/0005_not_null_fks.sql  yabancı anahtar bütünlüğü
```

Sonra:

```bash
npm run seed          # yarışma, kategoriler, rubrik, 4 rol için test hesabı
npm run demo:seed     # 9 demo raporu üret + yükle + kuyruğa al
MOCK_AI=false npm run demo:analyze   # kuyruğu GERÇEK modelle boşalt
npm run dev
```

### Ortam değişkenleri

`.env.example` tüm anahtar adlarını içerir. Kritik olanlar:

| Değişken | Not |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` · `..._ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **sunucu tarafı**, RLS'i baypas eder |
| `GOOGLE_API_KEY` | aistudio.google.com/apikey (ücretsiz) — **sunucu tarafı** |
| `GOOGLE_API_KEY_1..10` | ek anahtar havuzu. Kota model × **proje** başına günde 20 istek; farklı AI Studio projelerinden anahtar eklemek kotayı toplar |
| `GEMINI_MODEL` | `gemini-3.5-flash` |
| `GEMINI_MODEL_CHAIN` | 429/404'te denenecek model sırası |
| `MOCK_AI` | **varsayılan `true`** — env unutulursa gerçek API çağrılmaz |
| `REGISTRATION_CODE_*` | üç rol için kayıt kodu. Gerçek değerler repoya girmez |
| `NEXT_PUBLIC_DEMO_MODE` | `/demo` rol geçiş ekranını açar. Build anında okunur |

**Hakem veya yönetici hesabı gerekiyorsa proje sahibinden kayıt kodu isteyin.**

### `MOCK_AI` bir güvenlik/kota kontrolüdür

`MOCK_AI=true` iken gerçek API hiç çağrılmaz; her kontrol için sabit bir
fixture döner. Geliştirme boyunca açık kalmalı. Gerçek çağrı yalnızca (a) bir
kontrolü ilk kez uçtan uca test ederken, (b) deploy öncesi son doğrulamada
yapılır.

Ücretsiz katman **model başına günde 20 istek** veriyor. Dokuz rapor × altı
kontrol = 54 istek, yani tek modelle bir günde tam analiz mümkün değil. Kota
model başına olduğu için `GEMINI_MODEL` değiştirerek devam edilebilir.

## Rotalar

```
/                            ana sayfa
/auth                        giriş / kayıt (kayıt kodu ile rol atama)
/gizlilik                    KVKK aydınlatma metni
/submissions · /new · /[id]  yarışmacı: rapor listesi, yükleme, geri bildirim
/review · /[id]              hakem: atanan raporlar, kriter değerlendirmesi
/review/[id]/similarity      benzerlik detayı, yan yana karşılaştırma
/evaluation                  değerlendirme panosu
/evaluation/assignments      hakem ataması (manuel + dengeli dağıt)
/evaluation/feedback/[id]    geri bildirim düzenleme ve yayımlama
/admin/competitions          yarışma bilgileri (ad/yıl/dil/son başvuru) + kategori CRUD
/admin/competitions/template şablon yükleme (AI çıkarımı: bölümler + rubrik), benzerlik eşiği
/demo                        rol geçişi — navigasyonda linklenmez
```

## Bilinen sınırlar

- Hakem–AI sohbeti (`correction_log` tabanlı "hafif öğrenme") iptal edildi;
  hakem aksiyonu doğrudan düzenlemeyle sınırlı.
- Yarışma Yöneticisi ekranlarının bir kısmı yok; rubrik ya şablon PDF'inden
  AI ile çıkarılıyor ya da seed SQL ile elle yönetiliyor (kategoriler artık
  admin panelinden CRUD edilebiliyor).
- `/gizlilik` metni taslak; hukuki gözden geçirme gerekiyor.
- Taranmış (metin katmanı olmayan) PDF kabul edilmiyor; OCR kapsam dışı.

Ayrıntılı liste: [`docs/NOTES.md`](docs/NOTES.md).
Mimari kararlar ve gerekçeleri: [`docs/PLAN.md`](docs/PLAN.md).

## Gelecek sürüm

Sistemin gelecek sürümünde, geçmiş onaylı raporlar ve hakem düzeltmeleri
kullanılarak bir dil modelinin ince ayar (fine-tuning) yoluyla eğitilmesi
planlanıyor; zaman kısıtı nedeniyle bu Creathon kapsamında uygulanmadı.
