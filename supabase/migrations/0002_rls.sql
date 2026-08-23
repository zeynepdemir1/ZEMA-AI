-- ZEMA — 0002_rls.sql
-- Kaynak: docs/PLAN.md §3.1 (erişim matrisi) + §3.2 (rol/KVKK) + §8 ("RLS asla kesilmez")
--
-- TEMEL KURAL (§3.1): Ham AI analizi yarışmacıya ASLA açılmaz. Yarışmacı yalnızca
-- feedback tablosundaki is_published=true satırı görür.
--
-- Yazma işlemlerinin çoğu (job runner, analiz sonuçları, rol atama, audit log)
-- service_role ile yapılır; service_role RLS'i baypas eder, o yüzden bu dosyada
-- onlar için politika tanımlanmaz. Politika yokluğu = anon/authenticated için kapalı.

-- ─────────────────────────────────────────────────────────────
-- Yardımcı fonksiyonlar (security definer → RLS recursion'ı önler)
-- ─────────────────────────────────────────────────────────────

create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- Değerlendirme Yöneticisi + Yarışma Yöneticisi: matriste "hepsi (read)" olan roller
create or replace function auth_is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select auth_role() in ('evaluation_admin','competition_admin')
$$;

create or replace function auth_is_team_member(p_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid()
  )
$$;

-- Yarışmacı bu rapora sahip mi (kendi takımının raporu mu)
create or replace function auth_owns_report(p_report_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from reports r
    join team_members tm on tm.team_id = r.team_id
    where r.id = p_report_id and tm.user_id = auth.uid()
  )
$$;

-- Hakem bu rapora atanmış mı
create or replace function auth_can_judge_report(p_report_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assignments a
    where a.report_id = p_report_id and a.judge_id = auth.uid()
  )
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS'i her tabloda aç
-- ─────────────────────────────────────────────────────────────

alter table profiles            enable row level security;
alter table competitions        enable row level security;
alter table categories          enable row level security;
alter table criteria            enable row level security;
alter table teams               enable row level security;
alter table team_members        enable row level security;
alter table reports             enable row level security;
alter table analysis_jobs       enable row level security;
alter table analysis_results    enable row level security;
alter table similarity_pairs    enable row level security;
alter table assignments         enable row level security;
alter table ai_criterion_scores enable row level security;
alter table correction_log      enable row level security;
alter table evaluations         enable row level security;
alter table feedback            enable row level security;
alter table audit_log           enable row level security;

-- ─────────────────────────────────────────────────────────────
-- profiles
-- Matriste yoktu (§3.1) ama RLS açıkken politika şart, yoksa kimse kendi
-- profilini bile okuyamaz. Rol ataması service_role ile yapıldığı için (§3.2)
-- insert politikası bilinçli olarak YOK.
-- ─────────────────────────────────────────────────────────────

create policy profiles_select_own on profiles
  for select to authenticated using (id = auth.uid());

-- Atama ekranı hakem listesini görebilsin (§6 /evaluation/assignments)
create policy profiles_select_staff on profiles
  for select to authenticated using (auth_is_staff());

-- Kendi adını güncelleyebilir; role kolonunu DEĞİŞTİREMEZ.
-- auth_role() saklı değeri okur → yetki yükseltme denemesi check'i patlatır.
create policy profiles_update_own on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = auth_role());

-- KVKK: "Hesabımı ve Verilerimi Sil" (§3.2)
create policy profiles_delete_own on profiles
  for delete to authenticated using (id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- competitions / categories / criteria
-- Matris: herkes read, sadece Yarışma Yöneticisi CRUD
-- ─────────────────────────────────────────────────────────────

create policy competitions_select_all on competitions
  for select to authenticated using (true);
create policy competitions_write_admin on competitions
  for all to authenticated
  using (auth_role() = 'competition_admin')
  with check (auth_role() = 'competition_admin');

create policy categories_select_all on categories
  for select to authenticated using (true);
create policy categories_write_admin on categories
  for all to authenticated
  using (auth_role() = 'competition_admin')
  with check (auth_role() = 'competition_admin');

create policy criteria_select_all on criteria
  for select to authenticated using (true);
create policy criteria_write_admin on criteria
  for all to authenticated
  using (auth_role() = 'competition_admin')
  with check (auth_role() = 'competition_admin');

-- ─────────────────────────────────────────────────────────────
-- teams / team_members
-- Matriste yoktu. Yarışmacı kendi takımını görür; hakem ve yöneticiler
-- rapor listelerinde takım adını görebilmek için hepsini okur.
-- Takım oluşturma/düzenleme Yarışma Yöneticisinde (MVP: seed SQL ile).
-- ─────────────────────────────────────────────────────────────

create policy teams_select on teams
  for select to authenticated
  using (auth_is_team_member(id) or auth_role() <> 'competitor');
create policy teams_write_admin on teams
  for all to authenticated
  using (auth_role() = 'competition_admin')
  with check (auth_role() = 'competition_admin');

create policy team_members_select on team_members
  for select to authenticated
  using (user_id = auth.uid() or auth_is_team_member(team_id) or auth_role() <> 'competitor');
create policy team_members_write_admin on team_members
  for all to authenticated
  using (auth_role() = 'competition_admin')
  with check (auth_role() = 'competition_admin');

-- ─────────────────────────────────────────────────────────────
-- reports
-- Matris: yarışmacı kendi takımı (CRUD, submit'e kadar) / hakem atandıkları (read)
--         / her iki yönetici hepsi (read)
-- ─────────────────────────────────────────────────────────────

create policy reports_select_own_team on reports
  for select to authenticated using (auth_is_team_member(team_id));

create policy reports_select_judge on reports
  for select to authenticated using (auth_can_judge_report(id));

create policy reports_select_staff on reports
  for select to authenticated using (auth_is_staff());

create policy reports_insert_own_team on reports
  for insert to authenticated
  with check (auth_is_team_member(team_id) and status = 'draft');

-- "submit'e kadar": draft'tan çıktıktan sonra yarışmacı dokunamaz
create policy reports_update_draft on reports
  for update to authenticated
  using (auth_is_team_member(team_id) and status = 'draft')
  with check (auth_is_team_member(team_id) and status in ('draft','submitted'));

create policy reports_delete_draft on reports
  for delete to authenticated
  using (auth_is_team_member(team_id) and status = 'draft');

-- ─────────────────────────────────────────────────────────────
-- analysis_jobs / analysis_results
-- Matris: yarışmacı YOK. Yazma yalnızca service_role (job runner) → politika yok.
-- ─────────────────────────────────────────────────────────────

create policy analysis_jobs_select_judge on analysis_jobs
  for select to authenticated using (auth_can_judge_report(report_id));
create policy analysis_jobs_select_staff on analysis_jobs
  for select to authenticated using (auth_is_staff());

create policy analysis_results_select_judge on analysis_results
  for select to authenticated using (auth_can_judge_report(report_id));
create policy analysis_results_select_staff on analysis_results
  for select to authenticated using (auth_is_staff());

-- ─────────────────────────────────────────────────────────────
-- similarity_pairs
-- analysis_results ile aynı gizlilik sınıfı. Hakem judge_verdict'i işaretler
-- (§4.4: "hakem HER eşleşmeyi bağımsız değerlendirir") → UPDATE gerekli.
-- ─────────────────────────────────────────────────────────────

create policy similarity_pairs_select_judge on similarity_pairs
  for select to authenticated using (auth_can_judge_report(report_id));
create policy similarity_pairs_select_staff on similarity_pairs
  for select to authenticated using (auth_is_staff());
create policy similarity_pairs_update_judge on similarity_pairs
  for update to authenticated
  using (auth_can_judge_report(report_id))
  with check (auth_can_judge_report(report_id));

-- ─────────────────────────────────────────────────────────────
-- assignments
-- Matris: hakem kendi (read) / Değ. Yöneticisi hepsi (CRUD) / Yarışma Yön. hepsi (read)
-- ─────────────────────────────────────────────────────────────

create policy assignments_select_own on assignments
  for select to authenticated using (judge_id = auth.uid());
create policy assignments_select_staff on assignments
  for select to authenticated using (auth_is_staff());
create policy assignments_write_eval_admin on assignments
  for all to authenticated
  using (auth_role() = 'evaluation_admin')
  with check (auth_role() = 'evaluation_admin');

-- Hakem kendi atamasının durumunu ilerletebilir (pending → in_progress → submitted)
create policy assignments_update_own_status on assignments
  for update to authenticated
  using (judge_id = auth.uid())
  with check (judge_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- ai_criterion_scores
-- SAPMA NOTU: §3.1 matrisi hakem için "read" diyor, ama §4.5 ("mimari değişti")
-- hakemin final_text'i doğrudan düzenlemesini gerektiriyor. Matris eski;
-- §4.5 esas alındı ve hakem için atandığı raporlarda UPDATE verildi.
-- ─────────────────────────────────────────────────────────────

create policy ai_criterion_scores_select_judge on ai_criterion_scores
  for select to authenticated using (auth_can_judge_report(report_id));
create policy ai_criterion_scores_select_staff on ai_criterion_scores
  for select to authenticated using (auth_is_staff());
create policy ai_criterion_scores_update_judge on ai_criterion_scores
  for update to authenticated
  using (auth_can_judge_report(report_id))
  with check (auth_can_judge_report(report_id));

-- ─────────────────────────────────────────────────────────────
-- correction_log ("hafif öğrenme" kaynağı, §4.5)
-- ─────────────────────────────────────────────────────────────

create policy correction_log_select_own on correction_log
  for select to authenticated using (judge_id = auth.uid());
create policy correction_log_select_staff on correction_log
  for select to authenticated using (auth_is_staff());
create policy correction_log_insert_judge on correction_log
  for insert to authenticated
  with check (judge_id = auth.uid() and auth_can_judge_report(report_id));

-- ─────────────────────────────────────────────────────────────
-- evaluations
-- Matris: yarışmacı yok / hakem kendi assignment'ı (CRUD) / yöneticiler hepsi (read)
-- ─────────────────────────────────────────────────────────────

create policy evaluations_all_own_assignment on evaluations
  for all to authenticated
  using (exists (
    select 1 from assignments a
    where a.id = assignment_id and a.judge_id = auth.uid()
  ))
  with check (exists (
    select 1 from assignments a
    where a.id = assignment_id and a.judge_id = auth.uid()
  ));

create policy evaluations_select_staff on evaluations
  for select to authenticated using (auth_is_staff());

-- ─────────────────────────────────────────────────────────────
-- feedback
-- Matris: yarışmacı kendi + is_published=true / hakem read
--         / Değ. Yöneticisi CRUD + publish / Yarışma Yön. read
-- Bu, yarışmacının ham AI çıktısını görmesini engelleyen tek kapı — kritik.
-- ─────────────────────────────────────────────────────────────

create policy feedback_select_competitor on feedback
  for select to authenticated
  using (is_published = true and auth_owns_report(report_id));

create policy feedback_select_judge on feedback
  for select to authenticated using (auth_can_judge_report(report_id));

create policy feedback_select_staff on feedback
  for select to authenticated using (auth_is_staff());

create policy feedback_write_eval_admin on feedback
  for all to authenticated
  using (auth_role() = 'evaluation_admin')
  with check (auth_role() = 'evaluation_admin');

-- ─────────────────────────────────────────────────────────────
-- audit_log — yalnızca yöneticiler okur, yazma service_role ile
-- ─────────────────────────────────────────────────────────────

create policy audit_log_select_staff on audit_log
  for select to authenticated using (auth_is_staff());

-- ─────────────────────────────────────────────────────────────
-- Storage: 'reports' bucket (private)
-- Yol kuralı: <team_id>/<dosya>.pdf  → reports.file_path bu değerle birebir aynı.
-- ─────────────────────────────────────────────────────────────

create policy reports_storage_insert_own_team on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and auth_is_team_member(((storage.foldername(name))[1])::uuid)
  );

create policy reports_storage_select_own_team on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and auth_is_team_member(((storage.foldername(name))[1])::uuid)
  );

create policy reports_storage_delete_own_team on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and auth_is_team_member(((storage.foldername(name))[1])::uuid)
  );

-- Hakem yalnızca ATANDIĞI raporun PDF'ini açabilir
create policy reports_storage_select_judge on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and exists (
      select 1 from reports r
      where r.file_path = name
        and auth_can_judge_report(r.id)
    )
  );

create policy reports_storage_select_staff on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and auth_is_staff());
