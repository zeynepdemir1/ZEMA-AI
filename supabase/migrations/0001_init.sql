-- ZEMA — 0001_init.sql
-- Kaynak: docs/PLAN.md §3 (veri modeli) + §4.4 (benzerlik ön eleme altyapısı)
-- Not: RLS politikaları ayrı dosyada (0002_rls.sql).

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- §4.4 aşama 1: trigram ön eleme

-- ─────────────────────────────────────────────────────────────
-- Enum'lar
-- ─────────────────────────────────────────────────────────────

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

create type similarity_content_type as enum ('metin','tablo','gorsel');
create type similarity_verdict as enum ('pending','confirmed','false_positive');

create type feedback_status as enum ('done','partial','not_done');
create type edit_status as enum ('ai_generated','manually_edited','chat_refined','approved');

-- ─────────────────────────────────────────────────────────────
-- Kullanıcılar ve yarışma yapılandırması
-- ─────────────────────────────────────────────────────────────

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
  template_spec jsonb not null default '{}',     -- zorunlu bölümler, sayfa limiti, format kuralları
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

-- ─────────────────────────────────────────────────────────────
-- Raporlar
-- ─────────────────────────────────────────────────────────────

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

create index reports_competition_status_idx on reports (competition_id, status);

-- §4.4 Aşama 1 — aday eleme altyapısı (Postgres, bedava).
-- PLANDAN SAPMA YOK, sadece §4.4'teki DDL buraya taşındı ki şema tek yerde dursun.
alter table reports add column tsv tsvector
  generated always as (to_tsvector('simple', coalesce(extracted_text,''))) stored;

create index reports_tsv_idx on reports using gin (tsv);
create index reports_text_trgm_idx on reports using gin (extracted_text gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- Analiz kuyruğu ve sonuçları
-- ─────────────────────────────────────────────────────────────

create table analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  check_type check_type not null,
  status job_status not null default 'pending',
  attempts int not null default 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  -- EKLENDİ: planda bu kolon yoktu ama §3'teki indeks onu referans ediyordu.
  -- Ayrıca §2.1'deki FIFO kuyruk sırası için de gerekli.
  created_at timestamptz not null default now(),
  unique (report_id, check_type)
);

create index analysis_jobs_status_created_idx on analysis_jobs (status, created_at);

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

create table similarity_pairs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  other_report_id uuid references reports(id) on delete cascade,
  content_type similarity_content_type not null default 'metin',  -- metin/tablo/görsel ayrı ayrı işaretlenebilir
  lexical_score numeric,             -- trigram/FTS ön eleme skoru
  semantic_score numeric,            -- Claude ikili karşılaştırma skoru 0-100
  evidence jsonb,                    -- eşleşen pasaj/hücre/görsel çiftleri, bölüm referanslarıyla
  judge_verdict similarity_verdict not null default 'pending',  -- hakem HER eşleşmeyi bağımsız değerlendirir
  created_at timestamptz default now(),
  -- EKLENDİ: "yeniden çalıştır" butonu aynı çifti tekrar üretmesin (§5.2 maliyet notu).
  constraint similarity_pairs_distinct check (report_id <> other_report_id),
  unique (report_id, other_report_id, content_type)
);

create index similarity_pairs_report_idx on similarity_pairs (report_id, semantic_score desc);

-- ─────────────────────────────────────────────────────────────
-- Hakem akışı
-- ─────────────────────────────────────────────────────────────

create table assignments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references reports(id) on delete cascade,
  judge_id uuid references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id),
  status text not null default 'pending',  -- pending | in_progress | submitted
  due_at timestamptz,
  unique (report_id, judge_id)
);

create index assignments_judge_idx on assignments (judge_id, status);

-- AI'ın kriter bazlı yapılandırılmış geri bildirimi (§4.5)
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

-- Hakem-AI sohbet düzeltmeleri: hem UI geçmişi hem "hafif öğrenme" kaynağı (§4.5)
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

-- "Hafif öğrenme" prompt'u son N düzeltmeyi yarışma+kriter bazında çeker
create index correction_log_lookup_idx
  on correction_log (competition_id, criterion_id, created_at desc);

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

-- ─────────────────────────────────────────────────────────────
-- Yarışmacıya dönen geri bildirim + denetim
-- ─────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────
-- Storage — rapor PDF'leri (§2: Yarışmacı → PDF yükle → Supabase Storage)
-- Bucket private; erişim politikaları 0002_rls.sql'de.
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;
