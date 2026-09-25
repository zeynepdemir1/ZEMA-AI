-- ZEMA — 0014_verify_grants.sql
--
-- 0014_add_explicit_grants.sql'in onaylanmış tablo×rol×yetki matrisini
-- CANLI veritabanına karşı doğrular. YALNIZCA OKUR — hiçbir GRANT/REVOKE/
-- DML çalıştırmaz, veritabanında hiçbir şeyi değiştirmez.
--
-- GÜNCELLEME (0015_test_cleanup_grants.sql sonrası): competitions ve
-- audit_log için service_role/DELETE beklentisi false→true çevrildi.
-- GÜNCELLEME (0016_test_cleanup_grants_select.sql sonrası): audit_log
-- için service_role/SELECT de false→true (DELETE...WHERE'in ön koşulu).
-- Bu dosya "şu an doğru olması gereken toplam durumu" yansıtan CANLI bir
-- referans, 0014'ün donmuş bir tarihsel görüntüsü değil. Yeni bir grant
-- migration'ı geldiğinde bu matris yine güncellenmeli.
--
-- KULLANIM: Supabase SQL Editor'e yapıştırıp çalıştırın.
--   - Sonuç BOŞSA  → geçti, matris canlıyla birebir uyuşuyor.
--   - Sonuç DOLUYSA → her satır bir uyuşmazlık: ya olması gereken bir
--     yetki eksik, ya olmaması gereken bir yetki (özellikle anon'da) var,
--     ya da migration'larda tanımlı olmayan bir tablo/sequence bulundu.
--
-- Migration ÖNCESİ bir kez (0014 uygulanmadan önceki durumu görmek için —
-- o an hemen hemen her satır "eksik" çıkar, bu NORMAL) ve migration
-- SONRASI bir kez daha (bu sefer boş dönmeli) çalıştırılmak üzere
-- tasarlandı.
--
-- has_table_privilege() / has_sequence_privilege(), GRANT/REVOKE'un aksine
-- veritabanını DEĞİŞTİRMEZ — yalnızca "bu rolün bu yetkisi var mı" sorusunu
-- cevaplar. Bu dosya bu yüzden production'da tehlikesizce istenildiği kadar
-- çalıştırılabilir.

with expected(tbl, role, priv, expected) as (
  values
    ('ai_criterion_scores', 'anon', 'SELECT', false),
    ('ai_criterion_scores', 'anon', 'INSERT', false),
    ('ai_criterion_scores', 'anon', 'UPDATE', false),
    ('ai_criterion_scores', 'anon', 'DELETE', false),
    ('ai_criterion_scores', 'authenticated', 'SELECT', true),
    ('ai_criterion_scores', 'authenticated', 'INSERT', false),
    ('ai_criterion_scores', 'authenticated', 'UPDATE', false),
    ('ai_criterion_scores', 'authenticated', 'DELETE', false),
    ('ai_criterion_scores', 'service_role', 'SELECT', true),
    ('ai_criterion_scores', 'service_role', 'INSERT', true),
    ('ai_criterion_scores', 'service_role', 'UPDATE', true),
    ('ai_criterion_scores', 'service_role', 'DELETE', false),
    ('analysis_jobs', 'anon', 'SELECT', false),
    ('analysis_jobs', 'anon', 'INSERT', false),
    ('analysis_jobs', 'anon', 'UPDATE', false),
    ('analysis_jobs', 'anon', 'DELETE', false),
    ('analysis_jobs', 'authenticated', 'SELECT', true),
    ('analysis_jobs', 'authenticated', 'INSERT', false),
    ('analysis_jobs', 'authenticated', 'UPDATE', false),
    ('analysis_jobs', 'authenticated', 'DELETE', false),
    ('analysis_jobs', 'service_role', 'SELECT', true),
    ('analysis_jobs', 'service_role', 'INSERT', false),
    ('analysis_jobs', 'service_role', 'UPDATE', true),
    ('analysis_jobs', 'service_role', 'DELETE', false),
    ('analysis_results', 'anon', 'SELECT', false),
    ('analysis_results', 'anon', 'INSERT', false),
    ('analysis_results', 'anon', 'UPDATE', false),
    ('analysis_results', 'anon', 'DELETE', false),
    ('analysis_results', 'authenticated', 'SELECT', true),
    ('analysis_results', 'authenticated', 'INSERT', false),
    ('analysis_results', 'authenticated', 'UPDATE', false),
    ('analysis_results', 'authenticated', 'DELETE', false),
    ('analysis_results', 'service_role', 'SELECT', true),
    ('analysis_results', 'service_role', 'INSERT', true),
    ('analysis_results', 'service_role', 'UPDATE', true),
    ('analysis_results', 'service_role', 'DELETE', false),
    ('assignments', 'anon', 'SELECT', false),
    ('assignments', 'anon', 'INSERT', false),
    ('assignments', 'anon', 'UPDATE', false),
    ('assignments', 'anon', 'DELETE', false),
    ('assignments', 'authenticated', 'SELECT', true),
    ('assignments', 'authenticated', 'INSERT', true),
    ('assignments', 'authenticated', 'UPDATE', true),
    ('assignments', 'authenticated', 'DELETE', true),
    ('assignments', 'service_role', 'SELECT', true),
    ('assignments', 'service_role', 'INSERT', true),
    ('assignments', 'service_role', 'UPDATE', true),
    ('assignments', 'service_role', 'DELETE', false),
    ('audit_log', 'anon', 'SELECT', false),
    ('audit_log', 'anon', 'INSERT', false),
    ('audit_log', 'anon', 'UPDATE', false),
    ('audit_log', 'anon', 'DELETE', false),
    ('audit_log', 'authenticated', 'SELECT', false),
    ('audit_log', 'authenticated', 'INSERT', false),
    ('audit_log', 'authenticated', 'UPDATE', false),
    ('audit_log', 'authenticated', 'DELETE', false),
    ('audit_log', 'service_role', 'SELECT', true), -- 0016: DELETE...WHERE'in ön koşulu (test/ops temizliği)
    ('audit_log', 'service_role', 'INSERT', true),
    ('audit_log', 'service_role', 'UPDATE', false),
    ('audit_log', 'service_role', 'DELETE', true), -- 0015: yalnızca test/ops temizliği için
    ('categories', 'anon', 'SELECT', false),
    ('categories', 'anon', 'INSERT', false),
    ('categories', 'anon', 'UPDATE', false),
    ('categories', 'anon', 'DELETE', false),
    ('categories', 'authenticated', 'SELECT', true),
    ('categories', 'authenticated', 'INSERT', false),
    ('categories', 'authenticated', 'UPDATE', false),
    ('categories', 'authenticated', 'DELETE', false),
    ('categories', 'service_role', 'SELECT', true),
    ('categories', 'service_role', 'INSERT', true),
    ('categories', 'service_role', 'UPDATE', true),
    ('categories', 'service_role', 'DELETE', true),
    ('competitions', 'anon', 'SELECT', true),
    ('competitions', 'anon', 'INSERT', false),
    ('competitions', 'anon', 'UPDATE', false),
    ('competitions', 'anon', 'DELETE', false),
    ('competitions', 'authenticated', 'SELECT', true),
    ('competitions', 'authenticated', 'INSERT', false),
    ('competitions', 'authenticated', 'UPDATE', false),
    ('competitions', 'authenticated', 'DELETE', false),
    ('competitions', 'service_role', 'SELECT', true),
    ('competitions', 'service_role', 'INSERT', true),
    ('competitions', 'service_role', 'UPDATE', true),
    ('competitions', 'service_role', 'DELETE', true), -- 0015: yalnızca test/ops temizliği için
    ('correction_log', 'anon', 'SELECT', false),
    ('correction_log', 'anon', 'INSERT', false),
    ('correction_log', 'anon', 'UPDATE', false),
    ('correction_log', 'anon', 'DELETE', false),
    ('correction_log', 'authenticated', 'SELECT', false),
    ('correction_log', 'authenticated', 'INSERT', false),
    ('correction_log', 'authenticated', 'UPDATE', false),
    ('correction_log', 'authenticated', 'DELETE', false),
    ('correction_log', 'service_role', 'SELECT', false),
    ('correction_log', 'service_role', 'INSERT', false),
    ('correction_log', 'service_role', 'UPDATE', false),
    ('correction_log', 'service_role', 'DELETE', false),
    ('criteria', 'anon', 'SELECT', false),
    ('criteria', 'anon', 'INSERT', false),
    ('criteria', 'anon', 'UPDATE', false),
    ('criteria', 'anon', 'DELETE', false),
    ('criteria', 'authenticated', 'SELECT', true),
    ('criteria', 'authenticated', 'INSERT', false),
    ('criteria', 'authenticated', 'UPDATE', false),
    ('criteria', 'authenticated', 'DELETE', false),
    ('criteria', 'service_role', 'SELECT', true),
    ('criteria', 'service_role', 'INSERT', true),
    ('criteria', 'service_role', 'UPDATE', true),
    ('criteria', 'service_role', 'DELETE', true),
    ('evaluations', 'anon', 'SELECT', false),
    ('evaluations', 'anon', 'INSERT', false),
    ('evaluations', 'anon', 'UPDATE', false),
    ('evaluations', 'anon', 'DELETE', false),
    ('evaluations', 'authenticated', 'SELECT', false),
    ('evaluations', 'authenticated', 'INSERT', false),
    ('evaluations', 'authenticated', 'UPDATE', false),
    ('evaluations', 'authenticated', 'DELETE', false),
    ('evaluations', 'service_role', 'SELECT', false),
    ('evaluations', 'service_role', 'INSERT', false),
    ('evaluations', 'service_role', 'UPDATE', false),
    ('evaluations', 'service_role', 'DELETE', false),
    ('feedback', 'anon', 'SELECT', false),
    ('feedback', 'anon', 'INSERT', false),
    ('feedback', 'anon', 'UPDATE', false),
    ('feedback', 'anon', 'DELETE', false),
    ('feedback', 'authenticated', 'SELECT', true),
    ('feedback', 'authenticated', 'INSERT', false),
    ('feedback', 'authenticated', 'UPDATE', false),
    ('feedback', 'authenticated', 'DELETE', false),
    ('feedback', 'service_role', 'SELECT', true),
    ('feedback', 'service_role', 'INSERT', true),
    ('feedback', 'service_role', 'UPDATE', true),
    ('feedback', 'service_role', 'DELETE', false),
    ('profiles', 'anon', 'SELECT', false),
    ('profiles', 'anon', 'INSERT', false),
    ('profiles', 'anon', 'UPDATE', false),
    ('profiles', 'anon', 'DELETE', false),
    ('profiles', 'authenticated', 'SELECT', true),
    ('profiles', 'authenticated', 'INSERT', false),
    ('profiles', 'authenticated', 'UPDATE', false),
    ('profiles', 'authenticated', 'DELETE', false),
    ('profiles', 'service_role', 'SELECT', true),
    ('profiles', 'service_role', 'INSERT', true),
    ('profiles', 'service_role', 'UPDATE', true),
    ('profiles', 'service_role', 'DELETE', false),
    ('report_stages', 'anon', 'SELECT', false),
    ('report_stages', 'anon', 'INSERT', false),
    ('report_stages', 'anon', 'UPDATE', false),
    ('report_stages', 'anon', 'DELETE', false),
    ('report_stages', 'authenticated', 'SELECT', true),
    ('report_stages', 'authenticated', 'INSERT', false),
    ('report_stages', 'authenticated', 'UPDATE', false),
    ('report_stages', 'authenticated', 'DELETE', false),
    ('report_stages', 'service_role', 'SELECT', true),
    ('report_stages', 'service_role', 'INSERT', true),
    ('report_stages', 'service_role', 'UPDATE', true),
    ('report_stages', 'service_role', 'DELETE', false),
    ('reports', 'anon', 'SELECT', false),
    ('reports', 'anon', 'INSERT', false),
    ('reports', 'anon', 'UPDATE', false),
    ('reports', 'anon', 'DELETE', false),
    ('reports', 'authenticated', 'SELECT', true),
    ('reports', 'authenticated', 'INSERT', false),
    ('reports', 'authenticated', 'UPDATE', false),
    ('reports', 'authenticated', 'DELETE', false),
    ('reports', 'service_role', 'SELECT', true),
    ('reports', 'service_role', 'INSERT', true),
    ('reports', 'service_role', 'UPDATE', true),
    ('reports', 'service_role', 'DELETE', false),
    ('similarity_pairs', 'anon', 'SELECT', false),
    ('similarity_pairs', 'anon', 'INSERT', false),
    ('similarity_pairs', 'anon', 'UPDATE', false),
    ('similarity_pairs', 'anon', 'DELETE', false),
    ('similarity_pairs', 'authenticated', 'SELECT', true),
    ('similarity_pairs', 'authenticated', 'INSERT', false),
    ('similarity_pairs', 'authenticated', 'UPDATE', false),
    ('similarity_pairs', 'authenticated', 'DELETE', false),
    ('similarity_pairs', 'service_role', 'SELECT', true),
    ('similarity_pairs', 'service_role', 'INSERT', true),
    ('similarity_pairs', 'service_role', 'UPDATE', true),
    ('similarity_pairs', 'service_role', 'DELETE', false),
    ('team_members', 'anon', 'SELECT', false),
    ('team_members', 'anon', 'INSERT', false),
    ('team_members', 'anon', 'UPDATE', false),
    ('team_members', 'anon', 'DELETE', false),
    ('team_members', 'authenticated', 'SELECT', true),
    ('team_members', 'authenticated', 'INSERT', false),
    ('team_members', 'authenticated', 'UPDATE', false),
    ('team_members', 'authenticated', 'DELETE', false),
    ('team_members', 'service_role', 'SELECT', true),
    ('team_members', 'service_role', 'INSERT', true),
    ('team_members', 'service_role', 'UPDATE', true),
    ('team_members', 'service_role', 'DELETE', false),
    ('teams', 'anon', 'SELECT', false),
    ('teams', 'anon', 'INSERT', false),
    ('teams', 'anon', 'UPDATE', false),
    ('teams', 'anon', 'DELETE', false),
    ('teams', 'authenticated', 'SELECT', true),
    ('teams', 'authenticated', 'INSERT', false),
    ('teams', 'authenticated', 'UPDATE', false),
    ('teams', 'authenticated', 'DELETE', false),
    ('teams', 'service_role', 'SELECT', true),
    ('teams', 'service_role', 'INSERT', true),
    ('teams', 'service_role', 'UPDATE', false),
    ('teams', 'service_role', 'DELETE', true)
),
-- expected tablosunda YALNIZCA yukarıdaki 17 tablonun geçtiğini biliyoruz;
-- migration'larda tanımlı tablo kümesi burada tekrar listeleniyor ki
-- "undocumented table" kontrolü expected'e bağımlı olmasın.
known_tables(tbl) as (
  values
    ('ai_criterion_scores'), ('analysis_jobs'), ('analysis_results'),
    ('assignments'), ('audit_log'), ('categories'), ('competitions'),
    ('correction_log'), ('criteria'), ('evaluations'), ('feedback'),
    ('profiles'), ('report_stages'), ('reports'), ('similarity_pairs'),
    ('team_members'), ('teams')
),
grant_mismatches as (
  select
    'grant_mismatch' as check_type,
    e.tbl,
    e.role,
    e.priv,
    e.expected,
    has_table_privilege(e.role, 'public.' || e.tbl, e.priv) as actual
  from expected e
  -- Tablo hiç yoksa has_table_privilege hata fırlatır (undefined_table);
  -- bu yüzden yalnızca gerçekten var olan tablolar için kontrol ediyoruz.
  -- Eksik bir tablo zaten aşağıdaki missing_tables bloğunda yakalanıyor.
  where exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = e.tbl
  )
  and has_table_privilege(e.role, 'public.' || e.tbl, e.priv) is distinct from e.expected
),
sequence_mismatches as (
  select
    'sequence_mismatch' as check_type,
    'audit_log_id_seq' as tbl,
    r as role,
    'USAGE' as priv,
    (r = 'service_role') as expected,
    has_sequence_privilege(r, 'public.audit_log_id_seq', 'USAGE') as actual
  from unnest(array['anon', 'authenticated', 'service_role']) as r
  where exists (
    select 1 from information_schema.sequences s
    where s.sequence_schema = 'public' and s.sequence_name = 'audit_log_id_seq'
  )
  and has_sequence_privilege(r, 'public.audit_log_id_seq', 'USAGE') is distinct from (r = 'service_role')
),
missing_expected_tables as (
  -- known_tables'ta olup live DB'de bulunmayan tablo (şema drift'i).
  select 'missing_table' as check_type, k.tbl, null::text as role, null::text as priv,
         null::boolean as expected, null::boolean as actual
  from known_tables k
  where not exists (
    select 1 from information_schema.tables t
    where t.table_schema = 'public' and t.table_name = k.tbl
  )
),
undocumented_tables as (
  -- Live DB'de olup migration'larda/known_tables'ta tanımlı olmayan tablo.
  select 'undocumented_table' as check_type, t.table_name as tbl, null::text as role,
         null::text as priv, null::boolean as expected, null::boolean as actual
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_type = 'BASE TABLE'
    and not exists (select 1 from known_tables k where k.tbl = t.table_name)
)
select * from grant_mismatches
union all
select * from sequence_mismatches
union all
select * from missing_expected_tables
union all
select * from undocumented_tables
order by check_type, tbl, role, priv;
