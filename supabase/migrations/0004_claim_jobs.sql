-- ZEMA — 0004_claim_jobs.sql
--
-- PLAN.md §2.1: "POST /api/jobs/tick her çağrıda FOR UPDATE SKIP LOCKED ile
-- 1–2 iş çeker, çalıştırır, sonucu yazar."
--
-- SKIP LOCKED PostgREST üzerinden ifade edilemiyor (REST'te satır kilidi yok),
-- o yüzden atomik "işi kap" mantığı bir SQL fonksiyonuna alındı. Bu, aynı anda
-- gelen iki tick'in aynı işi iki kez çalıştırmasını (ve iki kez API kotası
-- harcamasını) engelliyor.

create or replace function claim_analysis_jobs(
  p_limit int default 2,
  -- Çöken bir tick'in işi sonsuza dek 'running' kalmasın: bu süreden eski
  -- running işler yeniden kapılabilir hale gelir.
  p_stale_after interval default '5 minutes'
)
returns setof analysis_jobs
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return query
  update analysis_jobs j
     set status     = 'running',
         started_at = now(),
         attempts   = j.attempts + 1
   where j.id in (
           select c.id
             from analysis_jobs c
            where c.status = 'pending'
               or (c.status = 'running' and c.started_at < now() - p_stale_after)
            order by c.created_at
              for update skip locked
            limit p_limit
         )
  returning j.*;
end
$$;

comment on function claim_analysis_jobs(int, interval) is
  'Kuyruktan atomik olarak iş kapar (FOR UPDATE SKIP LOCKED). Yalnızca service_role.';

-- ─────────────────────────────────────────────────────────────
-- Erişim: yalnızca service_role
-- 0003_grants.sql tüm fonksiyonları üç role de verdi; bu fonksiyon
-- iş kuyruğunu manipüle ettiği için anon/authenticated'tan geri alınıyor.
-- ─────────────────────────────────────────────────────────────

revoke all on function claim_analysis_jobs(int, interval) from public;
revoke all on function claim_analysis_jobs(int, interval) from anon;
revoke all on function claim_analysis_jobs(int, interval) from authenticated;
grant execute on function claim_analysis_jobs(int, interval) to service_role;

-- ─────────────────────────────────────────────────────────────
-- Rapor yüklenince 6 kontrol işini açan yardımcı (§2.1)
-- ─────────────────────────────────────────────────────────────

create or replace function enqueue_report_checks(p_report_id uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  inserted int;
begin
  insert into analysis_jobs (report_id, check_type)
  select p_report_id, ct
    from unnest(enum_range(null::check_type)) as ct
  on conflict (report_id, check_type) do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end
$$;

comment on function enqueue_report_checks(uuid) is
  'check_type enum''undaki her değer için bir pending iş açar. Idempotent.';

revoke all on function enqueue_report_checks(uuid) from public;
revoke all on function enqueue_report_checks(uuid) from anon;
revoke all on function enqueue_report_checks(uuid) from authenticated;
grant execute on function enqueue_report_checks(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────
-- §4.4 Aşama 1 — benzerlik aday elemesi (Postgres, bedava)
-- Claude/Gemini'ye O(N²) ikili karşılaştırma göndermemek için önce trigram
-- ile aynı yarışma + aynı kategori içinden en yakın adaylar çekilir.
-- ─────────────────────────────────────────────────────────────

create or replace function similarity_candidates(
  p_report_id uuid,
  p_limit int default 5
)
returns table (candidate_id uuid, lexical_score numeric)
language sql
stable
security definer
set search_path = public
as $$
  with src as (
    select id, competition_id, category_id, extracted_text
      from reports
     where id = p_report_id
  )
  select r.id,
         round(similarity(r.extracted_text, src.extracted_text)::numeric, 4)
    from reports r
    cross join src
   where r.id <> src.id
     and r.competition_id = src.competition_id
     and (src.category_id is null or r.category_id = src.category_id)
     and r.extracted_text is not null
     and src.extracted_text is not null
     -- Tamamen ilgisiz raporları modele hiç göndermemek için taban eşik.
     and similarity(r.extracted_text, src.extracted_text) > 0.05
   order by similarity(r.extracted_text, src.extracted_text) desc
   limit p_limit;
$$;

comment on function similarity_candidates(uuid, int) is
  '§4.4 aşama 1: trigram ile en yakın N rapor. Model çağrısı yapılmaz.';

revoke all on function similarity_candidates(uuid, int) from public;
revoke all on function similarity_candidates(uuid, int) from anon;
revoke all on function similarity_candidates(uuid, int) from authenticated;
grant execute on function similarity_candidates(uuid, int) to service_role;
