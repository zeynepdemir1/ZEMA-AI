# ZEMA — Uygulama Planı

**Bağlam:** T3 Vakfı Bursiyer Yapay Zeka Creathonu, Problem 4 — TEKNOFEST rapor değerlendirmelerini destekleyen AI sistemi.
**Ürün adı:** ZEMA.
**Kısıt:** Tek geliştirici.
**Stack:** Next.js (App Router) + Supabase (Postgres/Auth/Storage) + Google Gemini API (ücretsiz katman) + Vercel.
*(Sağlayıcı 23 Ağustos'ta Claude API'den Gemini'ye çevrildi — bütçe kısıtı, bkz. §4.)*

**⚠️ Gerçek takvim (bu bölüm plan ilk yazıldığında yoktu, sonradan netleşti):**
- **Görevlerin Teslimi: 26 Ağustos, saat 10:00** — üç ayrı çıktı zorunlu: (1) **canlıda çalışan uygulama** (video değil, gerçek deploy), (2) İş Modeli Canvası, (3) Girişim Sunumu (pptx). Bu üçü paralel ilerlemeli, sadece kod değil.
- Finalist takımlar 29 Ağustos açıklanıyor.
- Asıl yoğun geliştirme + mentörlük + Demo Day, finale kalınırsa **5-6 Eylül'de İstanbul'da yüz yüze** oluyor. Yani 26 Ağustos'a kadarki hedef "ikna edici, çalışan bir MVP" — mükemmel/tam bitmiş sistem değil.

**⚠️ KVKK zorunluluğu:** Şartname KVKK uyumunu açıkça istiyor. Kayıt formunda onay kutusu + `/gizlilik` sayfasında aydınlatma metni + RLS ile veri izolasyonu + basit bir "hesabımı sil" mekanizması şart (bkz. §3.2 ve §6).

**⚠️ Rol atama mekanizması:** Kullanıcılar rolünü kayıt ekranında seçmiyor. Yarışmacı serbest kayıt olur; Hakem/Yarışma Yöneticisi/Değerlendirme Yöneticisi rolleri sadece doğru **kayıt kodu** girilirse atanıyor (bkz. §3.2). Kodların gerçek değerleri `.env`'de tutulur, repoya (README dahil) hiçbir zaman gerçek kod değeri yazılmaz — sadece mekanizma açıklanır.

---

## 0. Açık Sorular (cevaplanmadan da ilerlenebilir, varsayımlar aşağıda)

1. **6. gereksinim ne?** Mesajda 5 tane sayıldı (dil/şablon, başlık-içerik, kategori/benzerlik, AI kriter değerlendirmesi, geri bildirim). Ben "kategori" ile "benzerlik"i iki ayrı kontrol olarak ayırıp 6'ya tamamladım. Şartnamede farklıysa (ör. *hakem atama/kalibrasyon* veya *intihal*) 6. pipeline slotunu ona ayır — mimari zaten N-kontrol için kurgulandı.
2. **Rapor formatı:** PDF varsayıldı. DOCX de gelecekse `mammoth` ile metne çevir, aynı hattı kullan.
3. **Gerçek TEKNOFEST rubriği/şablonu var mı?** Yoksa `competitions.template_spec` + `criteria` tablolarını admin panelinden düzenlenebilir bıraktım; demo için makul bir rubrik seed'lenir.

**Karar:** Bu üçü cevap beklemeden ilerlemeyi engellemiyor. Varsayımlarla inşa et, şartname netleşince seed verisini değiştir.

---

## 1. Ürün Çerçevesi — "AI karar vermez, hakemi hızlandırır"

Jüri karşısında en kritik konumlandırma bu. Sistem hiçbir yerde nihai puanı tek başına belirlemez:

- Her AI çıktısı **öneri** olarak işaretlenir, hakem onaylar/ezer (override).
- Her ezme işlemi gerekçesiyle saklanır → **AI-hakem sapma paneli** (kalibrasyon verisi).
- Her AI çıktısı için model id, prompt sürümü, token kullanımı, zaman damgası loglanır → **denetlenebilirlik**.
- Model kanıt gösteremediğinde `insufficient_evidence` döner, uydurmaz.

Bu dört madde, "LLM'e sorduk" seviyesindeki rakiplerden ayıran şey.

---

## 2. Mimari

```
Yarışmacı → PDF yükle → Supabase Storage
                             │
                    /api/reports (metin çıkarımı: unpdf)
                             │
                    analysis_jobs: 6 satır (report × check)
                             │
        ┌────────────────────┴────────────────────┐
        │  /api/jobs/tick  (her çağrıda N iş çeker) │
        │  client polling + Vercel Cron (yedek)     │
        └────────────────────┬────────────────────┘
                             │  her iş = 1 Claude çağrısı (streaming)
                             ▼
                     analysis_results
                             │
        ┌────────────────────┼────────────────────┐
      Hakem paneli   Değ. Yön. dashboard   Yarışmacı geri bildirimi
```

### 2.1 Neden job kuyruğu — bu planın en önemli teknik kararı

Vercel serverless fonksiyonları süre sınırlı (Hobby ~60 sn, Pro'da daha uzun). 6 kontrolü tek istekte çalıştırırsan **demo günü timeout yersin.** Çözüm:

- Rapor yüklenince `analysis_jobs` tablosuna 6 `pending` satır atılır.
- `POST /api/jobs/tick` her çağrıda `FOR UPDATE SKIP LOCKED` ile 1–2 iş çeker, çalıştırır, sonucu yazar.
- Tetikleyici: (a) yükleme sonrası client `tick`'i döngüde çağırır, (b) rapor ekranı 3 sn'de bir poll eder ve `tick` tetikler, (c) yedek olarak Vercel Cron.
- **Uyarı:** Vercel Hobby planında cron sıklığı çok kısıtlı (günlük). Buna güvenme; client tetiklemesi ana yol olsun. Deploy öncesi plan limitini doğrula.
- Her Claude çağrısında `stream: true` kullan → HTTP timeout riski düşer.
- `attempts` sayacı + `error` kolonu → başarısız iş 3 denemeden sonra `failed`, UI'da "tekrar dene" butonu.

Bu tasarım aynı zamanda **kısmi sonuç gösterimi** sağlıyor: 6 kontrolden 3'ü bitince hakem onları görmeye başlar. Demo'da çok iyi duruyor.

---

## 3. Veri Modeli (Supabase / Postgres)

```sql
-- Roller
create type user_role as enum ('competition_admin','evaluation_admin','judge','competitor');
create type report_status as enum ('draft','submitted','analyzing','analyzed','under_review','completed');
create type check_type as enum (
  'language_template',    -- 1. dil + şablon uyumu
  'title_content',        -- 2. başlık-içerik tutarlılığı
  'category_fit',         -- 3. kategori uygunluğu
  'similarity',           -- 4. benzerlik / özgünlük
  'criteria_scoring',     -- 5. rubrik bazlı AI puanlama
  'feedback_synthesis'    -- 6. yarışmacıya geri bildirim
);
create type job_status as enum ('pending','running','done','failed');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role user_role not null default 'competitor',
  full_name text,
  kvkk_consent_at timestamptz,           -- null ise onay verilmemiş, kayıt tamamlanmamış say
  created_at timestamptz default now()
);

create table competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  language text not null default 'tr',
  template_spec jsonb not null default '{}',  -- zorunlu bölümler, sayfa limiti, format kuralları
  similarity_threshold int not null default 50,  -- %, sadece UI filtresi — yeniden hesaplama tetiklemez
  submission_deadline timestamptz,
  created_by uuid references profiles(id)
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  name text not null,
  description text not null   -- kategori sınıflandırması bu metinden yapılır, dolu tut
);

create table criteria (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  category_id uuid references categories(id),  -- null = tüm kategoriler
  name text not null,
  description text not null,
  max_score numeric not null default 10,
  weight numeric not null default 1,
  sort_order int default 0
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  name text not null
);
create table team_members (
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  primary key (team_id, user_id)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  category_id uuid references categories(id),
  team_id uuid references teams(id),
  title text not null,
  file_path text not null,          -- Supabase Storage yolu
  extracted_text text,
  page_count int,
  word_count int,
  status report_status not null default 'draft',
  submitted_at timestamptz,
  created_at timestamptz default now()
);
create index on reports (competition_id, status);

create table analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  check_type check_type not null,
  status job_status not null default 'pending',
  attempts int not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  unique (report_id, check_type)
);
create index on analysis_jobs (status, created_at);

create table analysis_results (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  check_type check_type not null,
  score numeric,                     -- 0-100 normalize, kontrole göre anlamı değişir
  verdict text,                      -- 'pass' | 'warn' | 'fail' | 'insufficient_evidence'
  payload jsonb not null,            -- kontrole özel yapılandırılmış çıktı
  model text not null,
  prompt_version text not null,
  usage jsonb,                       -- input/output/cache token sayıları
  created_at timestamptz default now(),
  unique (report_id, check_type)
);

create type similarity_content_type as enum ('metin','tablo','gorsel');
create type similarity_verdict as enum ('pending','confirmed','false_positive');

create table similarity_pairs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  other_report_id uuid references reports(id) on delete cascade,
  content_type similarity_content_type not null default 'metin',  -- metin/tablo/görsel ayrı ayrı işaretlenebilir
  lexical_score numeric,             -- trigram/FTS ön eleme skoru
  semantic_score numeric,            -- Claude ikili karşılaştırma skoru 0-100
  evidence jsonb,                    -- eşleşen pasaj/hücre/görsel çiftleri, bölüm referanslarıyla
  judge_verdict similarity_verdict not null default 'pending',  -- hakem HER eşleşmeyi bağımsız değerlendirir
  created_at timestamptz default now()
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  judge_id uuid references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id),
  status text not null default 'pending',  -- pending | in_progress | submitted
  due_at timestamptz,
  unique (report_id, judge_id)
);

-- AI'ın kriter bazlı yapılandırılmış geri bildirimi
-- NOT: Bu tasarım sonradan değişti — tek "justification" yerine, hakemin
-- doğrudan düzenleyebileceği veya AI'yla sohbet ederek revize edebileceği
-- bir "final_text" akışına dönüştü (bkz. §4.5).
create type feedback_status as enum ('done','partial','not_done');
create type edit_status as enum ('ai_generated','manually_edited','chat_refined','approved');

create table ai_criterion_scores (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  criterion_id uuid references criteria(id) on delete cascade,
  score numeric,
  confidence numeric,                -- 0-1
  status feedback_status,            -- yapıldı / kısmen / yapılmadı
  ai_text text,                      -- AI'nin ürettiği: eksik + nasıl düzeltilir
  final_text text,                   -- hakemin düzenlediği/onayladığı nihai metin
  edit_status edit_status not null default 'ai_generated',
  evidence jsonb,                    -- [{quote, section_ref, verified: bool}]
  unique (report_id, criterion_id)
);

-- Hakem-AI sohbet düzeltmeleri: hem UI geçmişi hem de "hafif öğrenme" kaynağı.
-- Yeni bir rapor analiz edilirken, aynı yarışma+kriter için buradaki son birkaç
-- düzeltme özetlenip prompt'a eklenir (gerçek fine-tuning değil, ama pratikte
-- "hakemin tercihine uyum sağlama" etkisi veriyor — bkz. §4.5).
create table correction_log (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete cascade,
  criterion_id uuid references criteria(id) on delete cascade,
  report_id uuid references reports(id) on delete cascade,
  original_ai_text text not null,
  correction text not null,          -- hakemin düzenlediği son hal ya da sohbet talebi
  judge_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- Hakemin nihai puanı (AI'ı ezebilir)
create table evaluations (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid references assignments(id) on delete cascade,
  criterion_id uuid references criteria(id) on delete cascade,
  score numeric not null,
  comment text,
  ai_suggested_score numeric,        -- sapma analizi için anlık kopya
  override_reason text,              -- AI'dan belirgin saparsa zorunlu
  updated_at timestamptz default now(),
  unique (assignment_id, criterion_id)
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  content jsonb not null,            -- {strengths[], improvements[], next_steps[]}
  is_published boolean default false,
  published_by uuid references profiles(id),
  published_at timestamptz
);

create table audit_log (
  id bigserial primary key,
  actor uuid references profiles(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz default now()
);
```

### 3.1 RLS — 4 rol için erişim matrisi

| Tablo | Yarışmacı | Hakem | Değ. Yöneticisi | Yarışma Yöneticisi |
|---|---|---|---|---|
| `reports` | kendi takımı (CRUD, submit'e kadar) | atandıkları (read) | hepsi (read) | hepsi (read) |
| `analysis_results` | **yok** | atandıkları (read) | hepsi (read) | hepsi (read) |
| `ai_criterion_scores` | yok | atandıkları (read) | hepsi (read) | hepsi (read) |
| `evaluations` | yok | kendi assignment'ı (CRUD) | hepsi (read) | hepsi (read) |
| `assignments` | yok | kendi (read) | hepsi (CRUD) | hepsi (read) |
| `feedback` | kendi + `is_published=true` | read | CRUD + publish | read |
| `competitions/categories/criteria` | read | read | read | CRUD |

Yardımcı fonksiyon (RLS politikalarını kısaltır ve recursion'ı önler):

```sql
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;
```

**Kritik:** Ham AI analizini yarışmacıya asla açma — sadece `feedback` tablosundaki, Değerlendirme Yöneticisi'nin yayımladığı sürüm görünür. Bu hem itiraz riskini düşürür hem de ürünü ciddi gösterir.

### 3.2 Kayıt Kodu ile Rol Atama + KVKK

**Rol atama:** Kayıt formunda rol seçilmiyor. Opsiyonel, varsayılan kapalı/katlanmış bir "Kayıt Kodu" alanı var:

```ts
// .env — GERÇEK DEĞERLER REPOYA GİTMEZ, sadece .env.example'da boş anahtar adları bulunur
REGISTRATION_CODE_JUDGE=...
REGISTRATION_CODE_COMPETITION_ADMIN=...
REGISTRATION_CODE_EVALUATION_ADMIN=...
```

Kayıt endpoint'i: kod boşsa `role = 'competitor'`; kod bir env değişkeniyle eşleşirse ilgili role ata; eşleşmezse "Geçersiz kayıt kodu" hatası dön. README'de sadece mekanizma anlatılır ("hakem/yönetici iseniz proje sahibinden kod isteyin"), gerçek kod değeri asla yazılmaz — repo public olabileceği için.

**KVKK:** Kayıt formunda zorunlu onay kutusu (`kvkk_consent_at` doldurulmadan kayıt tamamlanmaz). `/gizlilik` route'unda aydınlatma metni: hangi veri toplanıyor (ad-soyad, e-posta, rapor içeriği), Google Gemini API'ye analiz amacıyla aktarıldığı açıkça belirtilir, saklama süresi, silme talebi hakkı. Profil ekranında basit bir "Hesabımı ve Verilerimi Sil" aksiyonu (onay diyaloğuyla) MVP için yeterli — otomatik saklama-süresi-sonu silme gibi bir cron mekanizması şimdilik gerekmiyor.

---

## 4. Altı Kontrolün Tasarımı

**⚠️ Sağlayıcı değişikliği (23 Ağustos):** Bütçe kısıtı nedeniyle Claude API yerine **Google Gemini API'nin ücretsiz katmanı** kullanılıyor (kredi kartı gerekmiyor). Aşağıdaki ortak ilkeler buna göre güncellendi; §4.1–4.6'daki Zod şemaları **aynen geçerli** — yalnızca modele gönderilme biçimi değişti.

Ortak ilkeler:
- **Model:** `gemini-3.5-flash` (ücretsiz katman, $0). Seçim tahminle değil, 23 Ağustos'ta canlı API'ye karşı ölçülerek yapıldı:
  - `gemini-2.5-*` → **404 NOT_FOUND**, artık mevcut değil
  - `gemini-3.7-flash` → `MINIMAL` düşünme seviyesini desteklemiyor (400), `MEDIUM`/`HIGH`'da tekrarlanan 429/503
  - `gemini-3.5-flash` → dört düşünme seviyesinin hepsi ilk denemede çalıştı, 1.4–7 sn
  Alias (`gemini-flash-latest`) **kullanılmıyor**: sessizce değişirse §1'in denetlenebilirlik iddiası bozulur. Gerçekte çalışan sürüm `response.modelVersion`'dan ayrıca loglanıyor. Bütçe açılırsa `criteria_scoring` gibi en kritik kontrol daha güçlü bir modele yükseltilebilir (`MODEL_OVERRIDES`).
- **Yapılandırılmış çıktı:** `responseJsonSchema` + `responseMimeType: 'application/json'`, Zod şemasından üretilir (`lib/ai/gemini-schema.ts`). Yanıt yine Zod ile doğrulanır. Regex ile JSON ayıklama yok.
  - Gemini tam JSON Schema kabul etmiyor. Zod v4'ün `z.toJSONSchema()` çıktısında **üç uyumsuz anahtar** var, dönüştürücü hallediyor: `$schema` atılıyor, `const` → `enum: [değer]`, `exclusiveMinimum/Maximum` → `minimum/maximum` (sınır dahil/hariç ayrımı kaybolur; gerçek kısıtı yanıt geldiğinde Zod yakalıyor). Her nesneye ayrıca `propertyOrdering` ekleniyor.
- **Düşünme (thinking):** Claude'un `output_config.effort`'unun karşılığı `thinkingConfig.thinkingLevel`. `gemini-3.5-flash`'ta ölçülen düşünme token'ları: `MINIMAL` 0 · `LOW` 441 · `MEDIUM` 934 · `HIGH` 1691. `criteria_scoring` → `HIGH`, ucuz kontroller → `MINIMAL`. **`MINIMAL` her modelde yok** — model değiştirilirse bu tablo yeniden doğrulanmalı.
- **Streaming:** kaldırıldı. Gemini çağrıları tek seferde dönüyor ve zaten §2.1'deki job kuyruğu Vercel süre limitini çözüyor — streaming yalnızca ikincil bir güvenceydi.
- **Prompt caching:** Anthropic'in `cache_control` breakpoint'leri yok (bkz. §5.1).
- **Prompt sürümü:** her prompt bir sabitte, `PROMPT_VERSIONS.criteria_scoring = "v3"`. Sonuçla birlikte yazılır.
- **⚠️ Bilinen prompt sorunu:** İlk gerçek çağrıda model Türkçe'yi **diyakritiksiz** yazdı ("tanimi", "basarili"). Dil kalitesini denetleyen bir üründe kabul edilemez — system prompt'a "Türkçe'yi tam diyakritiklerle yaz" talimatı eklenmeli (Gün 3).

### 4.1 `language_template` — Dil ve Şablon Kontrolü

**Önce kodla (bedava, anlık):** sayfa sayısı limiti, dosya boyutu, zorunlu başlıkların regex ile varlığı, kelime sayısı, boş bölümler. Bunlar `payload.deterministic` altına.

**Sonra Claude:** Türkçe dil kalitesi (imla, anlatım bozukluğu, akademik ton), şablon bölümlerinin *içerik olarak* doldurulmuş olup olmadığı (başlık var ama altı boş → yakalanmalı).

```ts
const LanguageTemplateSchema = z.object({
  language_detected: z.string(),
  is_expected_language: z.boolean(),
  sections: z.array(z.object({
    name: z.string(),
    present: z.boolean(),
    substantive: z.boolean(),        // başlık var ama içerik yok mu
    note: z.string(),
  })),
  language_issues: z.array(z.object({
    quote: z.string(),               // rapordan birebir alıntı
    issue_type: z.enum(['imla','anlatim','terminoloji','ton','tutarlilik']),
    severity: z.enum(['low','medium','high']),
    suggestion: z.string(),
  })),
  compliance_score: z.number().min(0).max(100),
  verdict: z.enum(['pass','warn','fail']),
});
```

> Sayfa düzeni (font, kenar boşluğu, satır aralığı) da denetlenecekse metin yetmez — PDF'i `document` bloğu olarak gönder (base64, `media_type: "application/pdf"`). Bu kontrolü metin tabanlı tut, layout denetimini **opsiyonel** listeye al; zaman kalırsa ekle.

### 4.2 `title_content` — Başlık-İçerik Tutarlılığı

Başlık + özet + bölüm başlıkları + gövdeden örneklem → uyum skoru, sapan noktalar, alternatif başlık önerileri.

```ts
const TitleContentSchema = z.object({
  alignment_score: z.number().min(0).max(100),
  title_promises: z.array(z.string()),        // başlığın vaat ettikleri
  unmet_promises: z.array(z.object({ promise: z.string(), why: z.string() })),
  content_not_in_title: z.array(z.string()),  // içerikte var, başlıkta yok
  suggested_titles: z.array(z.string()).max(3),
  verdict: z.enum(['pass','warn','fail']),
});
```

### 4.3 `category_fit` — Kategori Uygunluğu

`categories` tablosundaki tüm kategori adı+açıklaması prompt'a girer, model raporu sınıflandırır, beyan edilen kategoriyle karşılaştırılır.

```ts
const CategoryFitSchema = z.object({
  ranked_categories: z.array(z.object({
    category_id: z.string(),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  })).max(3),
  declared_category_confidence: z.number().min(0).max(1),
  is_mismatch: z.boolean(),
  recommendation: z.string(),
});
```

Kategori listesi tüm raporlarda aynı → **cache prefix'ine koy.**

### 4.4 `similarity` — Benzerlik / Özgünlük

> **⚠️ KAPSAM KESİNTİSİ (23 Ağustos):** Yalnızca **metin** benzerliği yapılıyor.
> Tablo ve görsel benzerliği iptal edildi — PDF'ten tablo/görsel ayrıştırma
> ayrı bir çıkarım hattı gerektiriyordu (bu bölümün "açık teknik soru" notu).
> Şema `content_type: 'metin'` ile sınırlandı, UI'daki tablo/görsel
> karşılaştırma görünümleri kaldırıldı.

İki aşamalı, çünkü N raporun tümünü Claude'a ikili karşılaştırmak O(N²) ve pahalı.

**Aşama 1 — aday eleme (Postgres, bedava):**
```sql
create extension if not exists pg_trgm;
alter table reports add column tsv tsvector
  generated always as (to_tsvector('simple', coalesce(extracted_text,''))) stored;
create index on reports using gin (tsv);
create index on reports using gin (extracted_text gin_trgm_ops);
```
Aynı yarışma + aynı kategori içinden `similarity()` ve `ts_rank` ile **top 5 aday** çek.

**Aşama 2 — Claude ile ikili yargı:** sadece o 5 çift için. Çıktı: `semantic_score`, ortak fikir mi ortak metin mi ayrımı, eşleşen pasaj çiftleri.

```ts
const SimilarityPairSchema = z.object({
  content_type: z.enum(['metin','tablo','gorsel']),
  semantic_score: z.number().min(0).max(100),
  overlap_type: z.enum(['none','ortak_alan_bilgisi','benzer_yaklasim','yakin_metin','muhtemel_kopya']),
  matched_passages: z.array(z.object({ a: z.string(), b: z.string(), note: z.string(),
    a_section_ref: z.string(), b_section_ref: z.string() })),
  assessment: z.string(),
});
```

**UI tarafı — önemli tasarım kararı:** Bir rapor birden fazla raporla eşleşebilir (1'e-N). Hakem ekranındaki "Benzerlik %X" göstergesi tıklanınca ayrı bir "Benzerlik Detayı" sayfası açılır: üstte en yüksek eşleşme yüzeti (toplam değil!), altında HER eşleşen rapor için ayrı kart — sıralı, büyükten küçüğe. Her kart: AI analiz metni + **yan yana (split, sekans olarak değil eş zamanlı) iki sütun** ("Bu Rapor" / "Karşılaştırılan Rapor") + içerik türüne göre gösterim (metin: vurgulanmış pasajlar; tablo: mockup tablo satırları; görsel: thumbnail'ler) + hakemin o eşleşmeyi bağımsız işaretlediği "Gerçek Benzerlik" / "Yanlış Pozitif" aksiyonu.

**Açık teknik soru — çözülmedi, backend'e geçince ele alınacak:** Tablo ve görsel benzerliğini tespit etmek metin benzerliğinden farklı bir çıkarım hattı gerektiriyor (PDF'ten tablo/görsel ayrıştırma). MVP'de bu üç content_type kategorisi şema ve UI'da yer açacak şekilde tasarlandı, ama gerçek tablo/görsel çıkarım pipeline'ı henüz tasarlanmadı — zaman kalırsa ayrıca ele al, kalmazsa `content_type: 'metin'` ile sınırlı kal ve bunu bilinçli bir kapsam kararı olarak not düş.

**Eşik kaydırıcısı:** `competitions.similarity_threshold` **sadece UI filtresi** — hakem kaydırıcıyı hareket ettirdikçe zaten hesaplanmış `similarity_pairs` satırları eşiğe göre filtrelenir, yeni bir Claude çağrısı tetiklenmez (anlık, bedava).

> **Yükseltme (zaman kalırsa):** `pgvector` + Voyage AI (`voyage-3.5`, çok dilli) embedding'i ile aday eleme. Trigram parafrazı kaçırır, embedding yakalar. Ama bu **ikinci bir API sağlayıcısı** demek — MVP'ye zorunlu değil. Gün 6'ya bırak.

### 4.5 `criteria_scoring` — Yapılandırılmış Kriter Bazlı Geri Bildirim (ana özellik)

> **⚠️ KAPSAM KESİNTİSİ (23 Ağustos):** "AI ile Konuş" ve buna bağlı
> `correction_log` / "hafif öğrenme" mekanizması **tamamen iptal edildi**
> (token bütçesi). Hakem aksiyonu olarak yalnızca **Doğrudan Düzenle**
> kaldı: `final_text` serbest metin, `edit_status = 'manually_edited'`.
> `correction_log` tablosu DB'de duruyor ama hiçbir kod yazmıyor.

**Önceki tasarım** (tek `justification` string'i, hakem sadece puanı ezerdi) **terk edildi.** Yerine gelen, VibeGrade tarzı satır-içi annotation'dan da farklı — **kriter başına yapılandırılmış bir metin bloğu**, hakem bunu ya doğrudan düzenliyor ya da AI'yla sohbet ederek revize ettiriyor. `effort: "high"`.

```ts
const CriteriaScoringSchema = z.object({
  criteria: z.array(z.object({
    criterion_id: z.string(),
    status: z.enum(['done','partial','not_done']),
    score: z.number(),
    confidence: z.number().min(0).max(1),
    ai_text: z.string(),                 // eksikler + nasıl düzeltilir, tek akıcı paragraf
    evidence_quotes: z.array(z.object({
      quote: z.string(),                 // rapordan BİREBİR
      section_ref: z.string(),           // "Bölüm 3.2" gibi — hakemin hızlı doğrulaması için
    })).min(0).max(3),
  })),
  overall_note: z.string(),
});
```

**Kanıt doğrulama (halüsinasyon kalkanı — bu özelliği mutlaka yap, benzerlik kontrolünde de aynı standart uygulanır):**
```ts
// Her alıntının extracted_text içinde gerçekten geçtiğini doğrula.
const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const haystack = normalize(report.extracted_text);
const verified = quote => haystack.includes(normalize(quote));
```
Doğrulanmayan alıntı UI'da **kırmızı "doğrulanamadı" rozeti** alır ve o kriterin `confidence` değeri düşürülür. Jüriye "halüsinasyona karşı ne yaptın?" sorusunun cevabı bu.

> **Not:** Claude'un yerleşik `citations` özelliği sayfa numarası verir ama `output_config.format` ile birlikte kullanılamaz (400 döner). Sayfa bazlı kanıt şart olursa `citations` + **strict tool use** kombinasyonuna geç. MVP için manuel doğrulama yeterli ve daha basit.

**Hakem aksiyonları — iki yol:**
1. **Doğrudan düzenle:** `final_text` alanı serbest metin, hakem yazar, `edit_status = 'manually_edited'`.
2. **AI ile konuş:** Hakem "bu çok sert, yumuşat" gibi bir mesaj yazar → backend `ai_text` + rapor metni + hakem mesajını Claude'a gönderir → dönen revize metin `final_text`'e yazılır, `edit_status = 'chat_refined'`, ve **`correction_log`'a kaydedilir.**

**"Hafif öğrenme" (gerçek fine-tuning değil, prompt-seviyesi uyum):** Yeni bir rapor için aynı yarışma+kriter analiz edilirken, `correction_log`'daki son birkaç düzeltme özetlenip system prompt'a eklenir:

```
Bu yarışmada, hakemler bu kritere dair önceki değerlendirmelerde şu tür 
düzeltmeler yaptı: [correction_log özeti]. Bunu göz önünde bulundurarak analiz et.
```

Bu, 1 haftada gerçekleştirilebilecek, gerçek bir eğitim pipeline'ı gerektirmeyen ama pratikte "sistem hakemin tarzına uyum sağlıyor" hissini veren bir teknik — demo anlatısında güçlü bir madde.

### 4.6 `feedback_synthesis` — Yarışmacı Geri Bildirimi

1–5 arası kontrollerin sonuçlarını girdi alır, **puan sızdırmadan** yapıcı Türkçe geri bildirim üretir.

```ts
const FeedbackSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).min(2).max(5),
  improvements: z.array(z.object({
    area: z.string(),
    what: z.string(),
    how: z.string(),          // somut, uygulanabilir adım
    priority: z.enum(['high','medium','low']),
  })).min(3).max(7),
  next_steps: z.array(z.string()).max(4),
});
```

Ton kuralı sistem prompt'unda: *"Lise/üniversite öğrencisi bir takıma yazıyorsun. Cesaret kırma, her eleştiriye somut bir düzeltme adımı ekle. Puan, sıralama veya diğer takımlardan bahsetme."*

Bu çıktı `feedback` tablosuna `is_published=false` yazılır → Değerlendirme Yöneticisi okur, düzenler, yayımlar.

---

## 5. Model API Kullanım Detayları (Gemini)

### 5.1 Önbellek — Gemini'de aynı mekanizma yok

**Bu bölüm baştan yazıldı.** Önceki hali Anthropic'e özgü bir prompt caching stratejisiydi: `system` ve `messages` içine `cache_control: { type: "ephemeral" }` breakpoint'leri koyarak rapor metnini 5 kontrolde tekrar tekrar göndermenin maliyetini düşürmek. **Gemini'de böyle bir breakpoint API'si yok**, o yüzden strateji tamamen kaldırıldı.

Gemini'nin karşılıkları:

- **Örtük (implicit) önbellek:** Desteklenen modellerde otomatik çalışır, istek gerektirmez. Ortak önek yakalanırsa girdi maliyeti/kotası düşer. Şu an buna güveniliyor.
- **Açık (explicit) önbellek:** `ai.caches.create()` ile bir `CachedContent` nesnesi oluşturup istekte referans vermek gerekir. Minimum token eşiği var ve nesnenin yaşam döngüsü elle yönetilir. **MVP'de kullanılmıyor** — ücretsiz katmanda maliyet zaten $0, karmaşıklığa değmez.

**Yapılan tek şey — istek sırasını korumak:** Sabit içerik (yarışma bağlamı `systemInstruction`'da, rapor metni ilk `part`'ta) önce, kontrole özel değişken talimat en sonda. Örtük önbelleğin ortak öneki yakalayabilmesi bunu gerektiriyor.

**Ölçüm:** `usage.cached_input_tokens` (`cachedContentTokenCount`) döndürülüyor. İlk gerçek çağrıda bu değer **0** çıktı — girdi yalnızca 415 token olduğu için örtük önbellek eşiğinin çok altında kaldı. Gerçek 20 sayfalık raporlarda (12–15k token) devreye girip girmediği bu alandan izlenmeli.

> **Not:** Önbellek artık bir maliyet kalemi değil, bir **kota** kalemi. Ücretsiz katmanın dakika/gün başına istek ve token limitleri var; önbellek tutarsa aynı limitle daha çok rapor işlenir.

### 5.2 Maliyet — ücretsiz katman, $0

**Ücretsiz katman kullanıldığı için para maliyeti yok.** Önceki tahmin (rapor başına $0.35–0.60, 100 raporluk set için $40–60) Claude API fiyatlandırmasına dayanıyordu ve artık geçersiz.

Yeni kısıt **para değil kota.** Ölçülen tek gerçek çağrı (`criteria_scoring`, 3 kriter, kısa rapor):

| Kalem | Ölçüm |
|---|---|
| Girdi | 415 token |
| Çıktı | 474 token |
| Düşünme (`thoughts`) | 2.232 token |
| **Toplam** | **3.121 token** |
| Süre | 9,8 sn (`thinkingLevel: HIGH`) |

Dikkat çeken şey **düşünme token'larının çıktının ~4,7 katı** olması. Kota planlarken hesaba katılmalı: `HIGH` düşünme pahalı, o yüzden yalnızca `criteria_scoring`'de açık, diğer kontroller `MINIMAL`/`MEDIUM`'da.

Gerçek 20 sayfalık raporlarda girdi 12–15k token olacağı için rapor başına kaba tahmin **~20–30k token × 6 kontrol**. Ücretsiz katmanın dakika ve gün başına limitleri bunu sınırlayacak — bu yüzden:

- **§5.4'teki `MOCK_AI` bayrağı artık daha da kritik.** Kota bitince geliştirme durur.
- Job runner 429'u **yeniden denenebilir** olarak işaretliyor ve backoff uyguluyor (§5.3). Ücretsiz katmanda 429 istisna değil, normal işleyişin parçası.
- **Anahtar havuzu:** `GOOGLE_API_KEY_1..10` ile birden fazla AI Studio projesinin kotası toplanır. Deneme sırası model-baskın (`flash/#1 → flash/#2 → … → flash-lite/#1`): en iyi modelde kalmak, zayıf modele düşmekten önce gelir. Detay: `lib/ai/key-pool.ts`, NOTES.md "Kota güvenliği".
- Demo günü seed raporların sonuçları DB'de hazır dursun (§9); canlı çağrı yalnızca tek bir rapor için yapılsın. Kota tükenirse demo çökmez.

### 5.4 Geliştirme Modu — Mock API (kota tasarrufu için ZORUNLU)

Gerçek model API çağrısı SADECE şu durumlarda yapılır: (a) bir kontrolü ilk kez 
uçtan uca test ederken, (b) demo/deploy öncesi son doğrulama. Bunun dışındaki 
tüm geliştirme (UI, layout, state yönetimi, hata senaryoları) **mock modda** 
yapılır.

Uygulama: `.env`'de `MOCK_AI=true/false` bayrağı. Her model çağrısını saran tek 
bir fonksiyon (`callModelForCheck()`, `lib/ai/call-claude-for-check.ts`) yaz: `MOCK_AI=true` iken 
gerçek API'yi hiç çağırma, her check_type için önceden yazılmış, ilgili Zod 
şemasına uyan sabit bir JSON fixture döndür (`/fixtures/language_template.json` 
gibi, her 6 kontrol için birer tane). `MOCK_AI=false` iken normal şekilde 
gerçek API'yi çağır.

Bu bayrak olmadan geliştirme ilerlemeyecek — her component değişikliğinde 
ücretsiz katman kotasının tükenmemesi için bu en baştan, Gün 1'de kurulmalı. 
Bayrak **varsayılan olarak AÇIK** (`MOCK_AI !== 'false'`): env unutulursa 
gerçek API çağrılmaz.

### 5.3 Hata yönetimi

Hepsini tek `catch` ile yutma. Sarmalayıcı hataları `CheckCallError` olarak 
yeniden fırlatıyor ve üzerine **`retryable`** bayrağı koyuyor; job runner 
(§2.1) yeniden deneme kararını buna bakarak veriyor.

```ts
catch (e) {
  if (e instanceof ApiError) {
    retryable = e.status === 429 || e.status >= 500   // kota / geçici
    // diğer 4xx → kalıcı, retry etme
  } else {
    retryable = true                                  // ağ kopması
  }
}
```

**Exception fırlatmayan iki durum ayrıca kontrol edilmeli** (HTTP 200 döner):

- `response.promptFeedback.blockReason` → güvenlik filtresi istemi engelledi (kalıcı)
- `response.candidates[0].finishReason !== 'STOP'` → `MAX_TOKENS` (çıktı yarıda kesilir, JSON bozuk gelir — yeniden denenebilir), `SAFETY` / `RECITATION` (kalıcı)

**Şablon çıkarımı (24 Ağustos):** `template_spec` artık elle doldurulmak
zorunda değil — Yarışma Yöneticisi gerçek şablon PDF'ini yükleyince
`extractTemplateSpec()` yapılandırılmış çıktı ile spec'i üretiyor.
Uydurmaya karşı iki alan: `not_specified` (şablonda bulunamayan alanlar) ve
`source_quotes` (birebir alıntılar, `verifyQuotes()` ile doğrulanıyor).
Eski spec `template_spec.previous`'ta saklanıp geri alınabiliyor.
Gerçek bir 10 bölümlük ÖTR kılavuzunda 12/12 alan ve 9/9 alıntı doğru çıktı.

**Sahadan gözlem (23 Ağustos):** Ücretsiz katmanda **503 UNAVAILABLE ve 429 
istisna değil, normal işleyişin parçası.** İlk gerçek çağrı denemesi 503 aldı; 
`gemini-3.7-flash` üzerinde 6 deneme üst üste düştü. Backoff'lu yeniden deneme 
olmadan bu sistem çalışmaz. Model seçimi de buna göre yapıldı (§4).

---

## 6. Ekranlar (rol bazlı)

```
/                          → Ana Sayfa (Karşılama): hero, "nasıl çalışır" özeti,
                              "Kullanmaya Başla" + "Demo Videosunu İzle" (modal,
                              video hazır olana kadar "yakında" placeholder'ı)
/auth                      → Giriş / Kayıt (tek ekran, iki sekme)
                              - Kayıt: ad-soyad, e-posta, şifre, opsiyonel/katlanmış
                                "Kayıt Kodu" alanı, KVKK onay kutusu (zorunlu)
                              - Giriş sonrası role göre otomatik yönlendirme
/gizlilik                  → KVKK aydınlatma metni

# Yarışmacı
/submissions               → takımın raporları + durum rozetleri
/submissions/new           → PDF yükle, kategori seç, başlık
/submissions/[id]          → durum + YAYIMLANMIŞ geri bildirim

# Hakem
/review                    → atanan raporlar, Yarışma → Kategori → Takım
                              hiyerarşisiyle gruplu (accordion), sade satırlar
                              (durum rozeti + takım adı + iç referans kodu —
                              kontrol oranı/benzerlik burada TEKRAR gösterilmez)
/review/[id]               → ⭐ sol: PDF görüntüleyici / sağ: AI analiz panosu
                              - 6 kontrolün sekmeleri
                              - kriter kriter yapılandırılmış geri bildirim
                                (durum rozeti + ai_text + kanıt alıntıları)
                              - "Doğrudan Düzenle" / "AI ile Konuş" aksiyonları
                              - belirgin sapmada gerekçe zorunlu
                              - "Onayla ve Gönder" (mühürleme)
/review/[id]/similarity     → Benzerlik Detayı: en yüksek eşleşme yüzdesi
                              (toplam DEĞİL) + her eşleşen rapor için ayrı kart,
                              content_type'a göre split-view karşılaştırma,
                              hakem her eşleşmeyi bağımsız işaretler

# Değerlendirme Yöneticisi
/evaluation                → tüm raporlar, analiz durumu, dashboard
/evaluation/assignments    → hakem atama (manuel + "dengeli dağıt" butonu)
/evaluation/calibration    → AI-hakem sapma grafiği, aykırı hakem tespiti
/evaluation/feedback/[id]  → AI geri bildirimini düzenle → yayımla

# Yarışma Yöneticisi
/admin/competitions        → yarışma, son tarih, similarity_threshold ayarı
/admin/categories          → kategori + açıklama (sınıflandırmayı besler)
/admin/criteria            → rubrik editörü (ağırlık, max puan)
/admin/template            → template_spec editörü (zorunlu bölümler, limitler)
/admin/overview            → genel istatistik

# Demo Modu (gizli, gerçek üründe yok)
/demo                      → ana navigasyonda LİNKLENMEZ, sadece video çekimi
                              ve canlı jüri demosu için. 4 buton, her biri
                              önceden hazırlanmış test hesabına tek tıkla giriş.
                              Sadece NEXT_PUBLIC_DEMO_MODE=true iken erişilebilir,
                              üretimde bu env kapatılır. Köşede küçük "DEMO" etiketi.
```

**Zaman kısıtı gerçeği:** 4 rol × tam ekran seti = çok iş. `shadcn/ui` + tek `DataTable` bileşeni + tek `RoleGuard` layout'u ile yaz. Admin ekranları basit CRUD form olsun, tasarıma yatırım yapma — yatırımı **`/review/[id]`** ve **`/review/[id]/similarity`** ekranlarına yap, demo orada yapılacak.

### 6.1 Marka ve Tasarım Sistemi (Claude Design çıktısıyla eşleşmeli)

Claude Code'un Tailwind teması bu değerlere göre kurulmalı, Claude Design'da üretilen tasarımla birebir tutarlı olsun:

- **Renkler:** Ink Navy `#1B2A4A` (ana/otorite), Slate Teal `#4C8577` (AI-üretimi içerik, onaylanmamış), Seal Gold `#C98A3E` (hakem-onaylı içerik — bu ikisinin ayrımı UI'da her zaman tutarlı kalmalı), başarı `#3F7D5C`, hata `#B4483F`, arka plan `#F7F7F5`.
- **Fontlar (Google Fonts, `next/font/google`):** Space Grotesk (başlık, seyrek kullan), IBM Plex Sans (gövde), IBM Plex Mono (yüzdeler, kriter kodları, zaman damgaları gibi "ölçülebilir" değerler).
- **Konsept:** "teknik inceleme raporu" — genel AI-tasarım klişelerinden (krem+serif+turuncu, siyah+neon, gazete düzeni) bilinçli olarak kaçınılıyor.

---

## 7. 7 Günlük Plan

| Gün | Hedef | Bitti sayılır ✅ |
|---|---|---|
| **1** | Supabase projesi, şema + RLS, auth, rol seçimi, Next.js iskeleti, shadcn, RoleGuard layout | 4 rolle giriş yapılıp farklı boş dashboard görülüyor |
| **2** | PDF yükleme → Storage → `unpdf` ile metin çıkarımı → `reports` kaydı. Yarışmacı ekranları. Seed: 15 sahte rapor PDF'i | Rapor yüklenip metni DB'de görünüyor |
| **3** | Job runner (`/api/jobs/tick`, SKIP LOCKED, retry). Kontrol 1–3 (deterministik ön kontroller + Claude). Prompt caching kurulumu | Bir rapor yüklenince 3 kontrol otomatik tamamlanıyor |
| **4** | Kontrol 4 (trigram + Claude ikili) ve 5 (kriter puanlama + **kanıt doğrulama**) | Kriter puanları kanıt alıntılarıyla, doğrulama rozetleriyle DB'de |
| **5** | ⭐ Hakem ekranı `/review/[id]`: PDF viewer + AI panosu + puanlama formu + override gerekçesi. Atama ekranı | Hakem baştan sona bir raporu değerlendirip gönderebiliyor |
| **6** | Kontrol 6 (geri bildirim) + yayımlama akışı. Kalibrasyon dashboard'u. Yarışma Yöneticisi CRUD ekranları | Uçtan uca akış: yükle → analiz → hakem → geri bildirim yayımla → yarışmacı görür |
| **7** | Demo verisi, demo senaryosu, README, Vercel deploy, hata yakalama, tampon, **kayıt kodu + KVKK sayfası + Demo Modu ekranı** | Prod URL'de 5 dakikalık demo pürüzsüz akıyor |

### Gün 7'ye bırakma — her gün sonunda deploy et
İlk deploy'u Gün 1'de yap. Vercel'de ilk kez Gün 6'da deploy etmek, bu planın en büyük tek riski.

### Paralel yürüyen, kod dışı teslimatlar (26 Ağustos için ayrıca zorunlu)
Bu üçü yukarıdaki günlük planın **dışında**, paralel ilerliyor — geliştirme takvimini bunlar için durdurma, ama unutma:
1. **İş Modeli Canvası** — 9 kutu (müşteri segmenti, değer önerisi, kanallar, gelir/maliyet vb.)
2. **Girişim Sunumu** (pptx) — Problem → Çözüm → Nasıl Çalışır → Farklılaşma → Etki → Ekip → Sonraki Adımlar
3. Bu ikisi, Claude Design'da üretilen ekran görüntüleri ve prototip videosuyla doğrudan besleniyor — sıfırdan yazılmıyor.

---

## 8. Kapsam Kesme Listesi (geride kalırsan sırayla at)

1. `pgvector` + embedding → trigram yeter
2. PDF layout/font denetimi (vision) → metin bazlı şablon kontrolü yeter
3. Realtime bildirim → polling yeter
4. E-posta bildirimi → tamamen at
5. Kalibrasyon dashboard'u → basit "AI vs Hakem" tablosu yeter
6. Yarışma Yöneticisi CRUD ekranları → seed SQL + Supabase Studio ile yönet, ekranı en sona bırak
7. DOCX desteği → sadece PDF

**Asla kesme:** job kuyruğu, kanıt doğrulama, hakem override, RLS, kayıt kodu mekanizması (güvenlik açığı olur), KVKK onay kutusu + aydınlatma metni (şartname zorunluluğu), ham AI çıktısının yarışmacıdan gizlenmesi.

---

## 9. Demo Stratejisi (jüri puanının yarısı burada)

**⚠️ Bu bölüm 24 Ağustos'ta gerçekleşen duruma göre yeniden yazıldı.** Veri seti
üretildi ve GERÇEK Gemini analizinden geçirildi; senaryo da buna göre sadeleşti.

### Hazır veri seti — dokuz rapor, hepsi gerçek analizden geçmiş

`npm run demo:seed` PDF'leri üretip yükler, `npm run demo:analyze` kuyruğu
gerçek modelle boşaltır. **Sonuçlar DB'de hazır; fixture değil.** Doğrulama:
54 sonucun 47'si `gemini-3.5-flash-lite` damgalı, 7'si `skipped:no-candidates`
(aday çıkmadığı için model hiç çağrılmadı), **0 tanesi `mock:` damgalı.**

| Rapor | Takım | Planlanan kusur | Ölçülen sonuç |
|---|---|---|---|
| R1 | ATMACA | Temiz referans rapor | hepsi `pass` |
| R2 | RÜZGÂR | "Sonuç" ve "Kaynakça" eksik | `language_template` **warn** |
| R3 | GARO | Başlık sualtı aracı, içerik hava aracı | `title_content` **fail** |
| R4 | PUSAT | Sabit Kanat beyan edilmiş, içerik tıbbi tanı cihazı | `category_fit` **fail** |
| R5 · R6 | SİMURG · KIVILCIM | Birebir paylaşılan mimari paragrafı | `similarity` **fail**, %65–75 |
| R7 | BOZKURT | Yöntem çok zayıf, sonuç güçlü | `criteria_scoring` **fail** |
| R8 | ŞAHİN | Ağır imla/anlatım bozuklukları | `language_template` **warn** |
| R9 | ALTAY | Literatür ve bütçe zayıf, test güçlü | `criteria_scoring` **fail** |

**Kanıt doğrulama sonucu: 57 alıntının 57'si rapor metninde birebir bulundu,
0 uydurma.** §1'in "model kanıt gösteremediğinde uydurmaz" iddiasının ölçülmüş
karşılığı bu — demoda söylenecek en güçlü tek cümle.

> **Planın ilk halinden iki sapma:** (1) R5'in R9 ile tablo benzerliği
> senaryodan çıktı, çünkü tablo/görsel benzerliği kapsam kesintisiyle iptal
> edildi (§4.4). Artık tek çift var: R5↔R6, metin. (2) Ortak bölümler ilk seed
> denemesinde sabit metin olarak paylaşılmıştı ve dokuz rapor birbirine %99
> benzer çıkmıştı; bölümler rapora özgü üretilecek şekilde yeniden yazıldı.

### 5 dakikalık demo akışı

1. **(30 sn) Problem.** "X rapor, Y hakem, Z gün. Darboğaz nerede?"
2. **(40 sn) Değerlendirme panosu.** Dokuz rapor, analiz durumları, hakem
   atamaları. Sistemin işleyen bir süreç olduğunu gösterir.
3. **(2 dk 15 sn) ⭐ Hakem ekranı — R3 (GARO).** Ekranın tamamı burada:
   - Başlık-içerik uyumsuzluğu, rapordan birebir alıntıyla
   - Kriter kriter yapılandırılmış geri bildirim, her biri kanıt alıntılı
   - **Kanıt doğrulama rozetleri** — "n/m DOĞRULANDI" sayacı ve güven değeri
   - Renk kodu: teal = onaylanmamış AI taslağı, gold = hakem onaylı
   - "Doğrudan düzenle" ile bir metni değiştir, "Onayla ve mühürle"
4. **(45 sn) Benzerlik detayı — R5 ↔ R6.** Yan yana karşılaştırma, paylaşılan
   paragraf vurgulu; hakem eşleşmeyi "Gerçek Benzerlik" olarak işaretler.
   Diğer yedi raporun `pass` olduğunu göster: sistem gürültü üretmiyor.
5. **(45 sn) Yayımlama → yarışmacı.** Değ. Yöneticisi geri bildirimi yayımlar,
   yarışmacı ekranına geçilir. **Yayımlanmadan önce o ekranın boş olduğunu
   göster** — ham AI analizi yarışmacıya hiçbir koşulda gitmiyor (§3.1).
6. **(30 sn) Kapanış.** "AI karar vermiyor, hızlandırıyor": kanıt doğrulama,
   hakem override'ı, audit log, model/prompt sürümü kaydı.

### Demo günü kuralları

- **Canlı yükleme YAPILMAYACAK.** Production'da `MOCK_AI=true` kalıyor; canlı
  yüklenen rapor fixture çıktısı üretir ve jüri önünde yer tutucu metin
  görünür. Dokuz rapor zaten gerçek analizden geçmiş, gösterilecek şey hazır.
- **Kalibrasyon panosu senaryodan çıkarıldı** (§8 kesme listesi 5. madde).
  Ayrılan 45 saniye hakem ekranına eklendi.
- **Ücretsiz katman kotası: model başına günde 20 istek.** Demo gününde
  deneme amaçlı analiz çalıştırma; kota tükenirse yeniden analiz yapılamaz.
- Ekran görüntüsü / demo için en güçlü iki rota:
  `/review/<R3>` ve `/review/<R5>/similarity`.
- Rol geçişi `/demo` üzerinden (ana navigasyonda linklenmiyor).

---

## 10. Bugün Yapılacaklar (Gün 1 ilk 3 saat)

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint
npm i @supabase/supabase-js @supabase/ssr @google/genai zod unpdf
npx shadcn@latest init
npx shadcn@latest add button card table tabs badge dialog form input select textarea sonner
```

1. Supabase projesi aç → `supabase/migrations/0001_init.sql` içine §3'teki şemayı koy
2. RLS politikalarını `0002_rls.sql`'e yaz (§3.1 matrisi)
3. `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `GEMINI_MODEL`, `MOCK_AI`
   → **`SUPABASE_SERVICE_ROLE_KEY` ve `GOOGLE_API_KEY` yalnızca server tarafında.** `NEXT_PUBLIC_` öneki verme.
   → Anahtar: [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (ücretsiz, kredi kartsız).
   → `ANTHROPIC_API_KEY` `.env.example`'da duruyor ama **kodda hiçbir yerde okunmuyor** — sağlayıcı geri alınabilsin diye korundu.
4. Vercel'e boş projeyi deploy et, env değişkenlerini gir, çalıştığını gör
5. `git push` — repo boş, ilk commit'i bugün at
