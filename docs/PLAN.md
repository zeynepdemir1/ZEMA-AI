# ZEMA — Uygulama Planı

**Bağlam:** T3 Vakfı Bursiyer Yapay Zeka Creathonu, Problem 4 — TEKNOFEST rapor değerlendirmelerini destekleyen AI sistemi.
**Ürün adı:** ZEMA.
**Kısıt:** Tek geliştirici.
**Stack:** Next.js (App Router) + Supabase (Postgres/Auth/Storage) + Claude API + Vercel.

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

**KVKK:** Kayıt formunda zorunlu onay kutusu (`kvkk_consent_at` doldurulmadan kayıt tamamlanmaz). `/gizlilik` route'unda aydınlatma metni: hangi veri toplanıyor (ad-soyad, e-posta, rapor içeriği), Claude API'ye analiz amacıyla aktarıldığı açıkça belirtilir, saklama süresi, silme talebi hakkı. Profil ekranında basit bir "Hesabımı ve Verilerimi Sil" aksiyonu (onay diyaloğuyla) MVP için yeterli — otomatik saklama-süresi-sonu silme gibi bir cron mekanizması şimdilik gerekmiyor.

---

## 4. Altı Kontrolün Tasarımı

Ortak ilkeler:
- **Model:** `claude-sonnet-5` ($2/$10 per MTok) — bütçe kısıtlı, ücretsiz $5 deneme kredisiyle başlanıyor. Opus'a göre ~2.5x daha ucuz, bu iş için (kontrol/sınıflandırma/yapılandırılmış çıktı) kalite farkı MVP'de hissedilmiyor. Rapor boyutları Sonnet'in bağlamına rahat sığıyor, chunk'lamaya gerek yok. Bütçe/kalite dengesi değişirse (finalist olup gerçek API kredisi alınırsa) `criteria_scoring` gibi en kritik kontrol Opus'a yükseltilebilir, diğerleri Sonnet'te kalabilir.
- **Yapılandırılmış çıktı:** `client.messages.parse()` + Zod (`zodOutputFormat`). Regex ile JSON ayıklama yok.
- **Adaptive thinking:** `thinking: { type: "adaptive" }`. Kriter puanlama gibi zor işlerde `output_config.effort: "high"`, ucuz kontrollerde `"low"`.
- **Streaming:** her çağrıda, timeout'a karşı. `stream.finalMessage()` ile topla.
- **Prompt caching:** rapor metni 5 kontrolde tekrar tekrar gönderiliyor → cache'le (§5).
- **Prompt sürümü:** her prompt bir sabitte, `PROMPT_VERSIONS.criteria_scoring = "v3"`. Sonuçla birlikte yazılır.

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

### 4.5 `criteria_scoring` — Yapılandırılmış Kriter Bazlı Geri Bildirim (ana özellik, mimari değişti)

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

## 5. Claude API Kullanım Detayları

### 5.1 Prompt Caching stratejisi

Aynı raporun metni 5 kontrolde tekrar gönderiliyor. Cache prefix eşleşmesi sırası: `tools` → `system` → `messages`. Yani:

```ts
const res = await client.messages.parse({
  model: "claude-opus-5",
  max_tokens: 16000,
  thinking: { type: "adaptive" },
  output_config: { effort: "high", format: zodOutputFormat(CriteriaScoringSchema) },
  system: [
    // 1) YARIŞMA BAZINDA SABİT — rubrik, şablon spec, kategori listesi, rol tanımı
    { type: "text", text: competitionContext, cache_control: { type: "ephemeral" } },
  ],
  messages: [
    {
      role: "user",
      content: [
        // 2) RAPOR BAZINDA SABİT — 5 kontrolde aynı
        { type: "text", text: `<rapor>\n${report.extracted_text}\n</rapor>`,
          cache_control: { type: "ephemeral" } },
        // 3) DEĞİŞKEN — kontrol talimatı, en sonda
        { type: "text", text: CHECK_INSTRUCTIONS.criteria_scoring },
      ],
    },
  ],
});
```

**Cache'i sessizce bozan şeyler — kaçın:** system prompt'una tarih/saat yazmak, `JSON.stringify` ile sırasız obje serileştirmek, kontrole göre değişen tool listesi. Doğrulama: `response.usage.cache_read_input_tokens` sıfırdan büyük olmalı. Sıfırsa prefix bozuluyor demektir.

> Minimum cache'lenebilir prefix ~1024 token. Kısa raporlarda cache tutmaz, sorun değil.

### 5.2 Maliyet tahmini

20 sayfalık rapor ≈ 12–15k token.

| Kalem | Hesap |
|---|---|
| Girdi (ilk çağrı, cache yazımı) | ~15k tok |
| Girdi (5 tekrar çağrı) | cache okuması — ham fiyatın çok altında |
| Çıktı (6 kontrol × ~2k) | ~12k tok × $25/MTok ≈ **$0.30** |
| Benzerlik ikili karşılaştırmalar | 5 çift × ~25k tok girdi |

**Rapor başına kaba tahmin: $0.35 – $0.60.** 100 raporluk demo veri seti ≈ **$40–60**. Creathon bütçesi için sorun değil, ama:
- Geliştirme sırasında **`analysis_results` cache'ini kullan** — aynı raporu 40 kez yeniden analiz etme. `tick` endpoint'inde `unique (report_id, check_type)` zaten koruyor; "yeniden çalıştır" butonunu bilinçli tut.
- Prompt iterasyonu için 3–4 raporluk küçük bir sabit set kullan.

### 5.4 Geliştirme Modu — Mock API (kredi tasarrufu için ZORUNLU)

Gerçek Claude API çağrısı SADECE şu durumlarda yapılır: (a) bir kontrolü ilk kez 
uçtan uca test ederken, (b) demo/deploy öncesi son doğrulama. Bunun dışındaki 
tüm geliştirme (UI, layout, state yönetimi, hata senaryoları) **mock modda** 
yapılır.

Uygulama: `.env`'de `MOCK_AI=true/false` bayrağı. Her Claude API çağrısını 
saran bir fonksiyon (`callClaudeForCheck()` gibi) yaz: `MOCK_AI=true` iken 
gerçek API'yi hiç çağırma, her check_type için önceden yazılmış, ilgili Zod 
şemasına uyan sabit bir JSON fixture döndür (`/fixtures/language_template.json` 
gibi, her 6 kontrol için birer tane). `MOCK_AI=false` iken normal şekilde 
gerçek API'yi çağır.

Bu bayrak olmadan geliştirme ilerlemeyecek — her component değişikliğinde 
gerçek API'ye para gitmemesi için bu en baştan, Gün 1'de kurulmalı.

### 5.3 Hata yönetimi

En spesifikten genele zincir kur — hepsini tek `catch` ile yutma:

```ts
try { ... }
catch (e) {
  if (e instanceof Anthropic.RateLimitError)      → job'u pending'e geri koy, backoff
  else if (e instanceof Anthropic.APIConnectionError) → retry
  else if (e instanceof Anthropic.APIStatusError && e.status >= 500) → retry
  else → job.status = 'failed', error kaydet, retry etme
}
```

Ayrıca `response.stop_reason === "refusal"` kontrolü ekle (HTTP 200 döner, exception fırlatmaz).

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

Seed veri setini **kusurları planlanmış** şekilde hazırla — her kontrolün gözle görülür şekilde tetiklenmesi lazım:

| Seed rapor | Planlanan kusur | Tetiklediği kontrol |
|---|---|---|
| R1 | Temiz, iyi rapor | Referans — hepsi yeşil |
| R2 | "Sonuç" ve "Kaynakça" bölümleri eksik | `language_template` |
| R3 | Başlık "Otonom Su Altı Aracı", içerik dron hakkında | `title_content` |
| R4 | Ulaşım kategorisine gönderilmiş ama içerik sağlık teknolojisi | `category_fit` |
| R5, R6, R9 | R5, hem R6 (%70, metin) hem R9 (%45, tablo/bütçe) ile ayrı ayrı benziyor — 1'e-N eşleşme demoda gösterilsin | `similarity` |
| R7 | Yöntem bölümü çok zayıf, sonuç kısmı güçlü | `criteria_scoring` — kriterler arası ayrışma |
| R8 | Ağır imla/anlatım bozuklukları | `language_template` dil kısmı |

**5 dakikalık demo akışı:**
1. (20 sn) Problem: "X rapor, Y hakem, Z gün. Darboğaz nerede?"
2. (40 sn) Yarışmacı R3'ü yükler → analiz kuyruğu canlı ilerler
3. (2 dk) **Hakem ekranı** — AI panosu açılır, başlık uyumsuzluğu kanıtla gösterilir, kriter bazlı yapılandırılmış geri bildirim alıntılarla gelir, hakem "AI ile Konuş" ile bir metni yumuşatır, "Onayla ve Gönder" ile mühürler
3.5. (30 sn) **Benzerlik Detayı** — R5'in hem R6 hem R9 ile ayrı ayrı eşleştiği, split-view karşılaştırma, her eşleşmenin bağımsız işaretlendiği gösterilir
4. (45 sn) Değ. Yöneticisi kalibrasyon panosu → AI-hakem sapması
5. (45 sn) Geri bildirim yayımlanır → yarışmacı ekranında görünür
6. (30 sn) Kapanış: kanıt doğrulama rozetleri + audit log → "AI karar vermiyor, hızlandırıyor"

Demoyu **canlı API'ye bağımlı bırakma.** Seed raporların analiz sonuçları DB'de hazır dursun; canlı çalıştırma sadece R3 için yapılsın. API yavaşlarsa demo çökmez.

---

## 10. Bugün Yapılacaklar (Gün 1 ilk 3 saat)

```bash
npx create-next-app@latest . --typescript --tailwind --app --eslint
npm i @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk zod unpdf
npx shadcn@latest init
npx shadcn@latest add button card table tabs badge dialog form input select textarea sonner
```

1. Supabase projesi aç → `supabase/migrations/0001_init.sql` içine §3'teki şemayı koy
2. RLS politikalarını `0002_rls.sql`'e yaz (§3.1 matrisi)
3. `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`
   → **`SUPABASE_SERVICE_ROLE_KEY` ve `ANTHROPIC_API_KEY` yalnızca server tarafında.** `NEXT_PUBLIC_` öneki verme.
4. Vercel'e boş projeyi deploy et, env değişkenlerini gir, çalıştığını gör
5. `git push` — repo boş, ilk commit'i bugün at
