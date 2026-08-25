-- ZEMA — 0010_report_stages.sql
--
-- ÇOK AŞAMALI RAPOR DESTEĞİ
--
-- TEKNOFEST'in gerçek yapısında bir yarışma tek bir rapor yerine sıralı
-- birkaç rapor isteyebiliyor: Ön Tasarım Raporu → Kritik Tasarım Raporu →
-- Final Değerlendirme Raporu. Her birinin kendi şablonu, kendi şartnamesi,
-- kendi rubriği ve kendi teslim tarihi var.
--
-- Şimdiye kadar bunların hepsi TEK bir competition satırında duruyordu
-- (`competitions.template_spec`, `competitions.submission_deadline`,
-- `criteria.competition_id`). Bu migration onları aşama düzeyine taşıyor.
--
-- ─── TASARIM KARARLARI ───
--
-- AŞAMAYA TAŞINAN:  template_spec (şablon + şartname çıkarımı), teslim
--                   tarihi, criteria (rubrik), reports.
-- YARIŞMADA KALAN:  categories (takım bir kategoride yarışır, aşamalar o
--                   kategorinin sıralı teslimleridir), teams (bir kullanıcı
--                   bir yarışmada tek takım — katman 2 kuralı yarışma
--                   düzeyinde), similarity_threshold (UI filtresi).
--
-- ─── KATILIM KURALI ANLAMINI DEĞİŞTİRİYOR ───
--
-- 0009 şunu koymuştu: unique (team_id, competition_id) — "bir takım bir
-- yarışmaya bir kez katılır". Aşamalar gelince bu kural YANLIŞ hale geliyor:
-- ÖTR verip sonra KTR vermek aynı takımın NORMAL akışı, ikinci bir katılım
-- değil. Kısıt bu yüzden AŞAMA düzeyine iniyor:
--
--     unique (team_id, stage_id)
--
-- Korunan asıl niyet aynı: bir takım BİR TESLİM için ikinci rapor
-- gönderemez ve kategori değiştirip ikinci kez giremez. Tek aşamalı
-- yarışmalarda davranış birebir eskisi gibi (aşama sayısı 1 → aşama kısıtı
-- yarışma kısıtına denk).
--
-- ─── GERİYE UYUMLULUK ───
--
-- 1. Her mevcut yarışmaya BİR varsayılan aşama açılıyor; adı
--    template_spec.report_type'tan alınıyor (yoksa "Ön Tasarım Raporu").
-- 2. Mevcut template_spec ve submission_deadline o aşamaya KOPYALANIYOR.
-- 3. Mevcut criteria ve reports satırları o aşamaya bağlanıyor.
-- 4. `competitions.template_spec` ve `competitions.submission_deadline`
--    KOLONLARI SİLİNMİYOR. Sebep: bu migration uygulamadan ÖNCE
--    çalıştırılıyor; kolonları hemen düşürmek çalışan siteyi kırardı.
--    Kod aşamaya geçtikten sonra ayrı bir migration (0011) ile düşürülür.
--    Bu dosya çalıştıktan sonra da uygulama eskisi gibi çalışmaya devam
--    eder — hiçbir veri kaybı, hiçbir yeniden analiz gerekmez.
--
-- Fikirdeş (idempotent): her adım "zaten var mı" kontrolüyle sarılı.

-- ─────────────────────────────────────────────────────────────
-- 1) report_stages
-- ─────────────────────────────────────────────────────────────

create table if not exists report_stages (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  -- "Ön Tasarım Raporu", "Kritik Tasarım Raporu", …
  name text not null,
  -- Aşamaların sırası. UNIQUE DEĞİL: yeniden sıralamada geçici çakışma
  -- olur ve tek tek UPDATE etmek imkansızlaşırdı.
  sort_order int not null default 1,
  -- Şablon + şartname çıkarımının tamamı (bkz. lib/reports/spec-sources.ts:
  -- sources.sablon / sources.sartname).
  template_spec jsonb not null default '{}',
  submission_deadline timestamptz,
  created_at timestamptz not null default now(),
  -- Aynı yarışmada aynı adda iki aşama olmaz; yarışmacı seçicisinde
  -- ayırt edilemez olurdu.
  unique (competition_id, name),
  -- BİLEŞİK FK HEDEFİ. reports ve criteria hem stage_id hem competition_id
  -- taşıyor; ikisi çelişirse (rapor A yarışmasında ama aşaması B
  -- yarışmasının) veri sessizce tutarsız olur. Bileşik FK bunu Postgres
  -- düzeyinde imkansız kılıyor — trigger yazmaya gerek kalmıyor.
  unique (id, competition_id)
);

create index if not exists report_stages_competition_idx
  on report_stages (competition_id, sort_order);

alter table report_stages enable row level security;

-- categories/competitions ile aynı desen: okuma herkese açık (hakem de
-- yarışmacı da aşama adını görmek zorunda), yazma yalnızca yarışma yöneticisi.
do $$
begin
  if not exists (select 1 from pg_policies
                  where tablename = 'report_stages' and policyname = 'report_stages_select_all') then
    create policy report_stages_select_all on report_stages
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies
                  where tablename = 'report_stages' and policyname = 'report_stages_write_admin') then
    create policy report_stages_write_admin on report_stages
      for all to authenticated
      using (auth_role() = 'competition_admin')
      with check (auth_role() = 'competition_admin');
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2) Her yarışmaya varsayılan aşama
-- ─────────────────────────────────────────────────────────────

insert into report_stages (competition_id, name, sort_order, template_spec, submission_deadline)
select c.id,
       coalesce(nullif(trim(c.template_spec->>'report_type'), ''), 'Ön Tasarım Raporu'),
       1,
       coalesce(c.template_spec, '{}'::jsonb),
       c.submission_deadline
  from competitions c
 where not exists (select 1 from report_stages s where s.competition_id = c.id);

-- ─────────────────────────────────────────────────────────────
-- 3) criteria ve reports aşamaya bağlanıyor
-- ─────────────────────────────────────────────────────────────

-- Kolonlar önce FK'sız ekleniyor: bileşik FK ancak backfill bittikten
-- sonra kurulabilir (boş stage_id bileşik FK'yı ihlal etmez ama NOT NULL
-- öncesi eklemek gereksiz risk).
alter table criteria add column if not exists stage_id uuid;
alter table reports  add column if not exists stage_id uuid;

-- Mevcut satırlar, yarışmalarının EN DÜŞÜK sort_order'lı (yani varsayılan)
-- aşamasına bağlanıyor.
update criteria k
   set stage_id = s.id
  from report_stages s
 where s.competition_id = k.competition_id
   and k.stage_id is null
   and s.sort_order = (select min(x.sort_order) from report_stages x
                        where x.competition_id = k.competition_id);

update reports r
   set stage_id = s.id
  from report_stages s
 where s.competition_id = r.competition_id
   and r.stage_id is null
   and s.sort_order = (select min(x.sort_order) from report_stages x
                        where x.competition_id = r.competition_id);

-- Boşta satır kalmadıysa NOT NULL'a çek. Kalırsa migration DURUR ve
-- hangi satırların bağlanamadığını söyler — sessizce yarım bırakmaz.
do $$
declare n_k int; n_r int;
begin
  select count(*) into n_k from criteria where stage_id is null;
  select count(*) into n_r from reports  where stage_id is null;
  if n_k > 0 or n_r > 0 then
    raise exception
      'AŞAMA BAĞLAMA TAMAMLANMADI: stage_id boş kalan % criteria ve % reports satırı var. '
      'Bu satırların competition_id değeri report_stages ile eşleşmiyor olabilir.', n_k, n_r;
  end if;
end $$;

alter table criteria alter column stage_id set not null;
alter table reports  alter column stage_id set not null;

-- BİLEŞİK FK: (stage_id, competition_id) çifti report_stages'te GERÇEKTEN
-- var olmak zorunda. Böylece raporun aşaması ile yarışması asla
-- çelişemez — trigger'sız, saf şema garantisi.
--
-- ON DELETE CASCADE bilinçli: report_stages competitions'tan cascade
-- alıyor; burada RESTRICT olsaydı bir yarışmayı silmek İMKANSIZ hale
-- gelirdi (cascade zinciri kendini kilitler). Aşamanın yanlışlıkla
-- silinip raporları götürmesi UYGULAMA KATMANINDA engellenecek —
-- kategori silmedeki onay deseninin aynısı.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'criteria_stage_competition_fk') then
    alter table criteria
      add constraint criteria_stage_competition_fk
      foreign key (stage_id, competition_id)
      references report_stages (id, competition_id)
      on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reports_stage_competition_fk') then
    alter table reports
      add constraint reports_stage_competition_fk
      foreign key (stage_id, competition_id)
      references report_stages (id, competition_id)
      on delete cascade;
  end if;
end $$;

create index if not exists criteria_stage_idx on criteria (stage_id, sort_order);
create index if not exists reports_stage_status_idx on reports (stage_id, status);

-- ─────────────────────────────────────────────────────────────
-- 4) Katılım kısıtı aşama düzeyine
-- ─────────────────────────────────────────────────────────────

alter table reports drop constraint if exists reports_one_entry_per_team_competition;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'reports_one_entry_per_team_stage') then
    alter table reports
      add constraint reports_one_entry_per_team_stage
      unique (team_id, stage_id);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5) Benzerlik adayları AYNI AŞAMA içinde aranmalı
-- ─────────────────────────────────────────────────────────────
--
-- Bir ÖTR'yi bir KTR ile karşılaştırmak anlamsız: farklı teslimler, farklı
-- şablonlar, doğal olarak farklı metinler. Aşama filtresi eklenmezse
-- yarışmanın bütün aşamaları birbirine karışır ve benzerlik skorları
-- gürültüye döner.

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
    select id, stage_id, category_id, extracted_text
      from reports
     where id = p_report_id
  )
  select r.id,
         round(similarity(r.extracted_text, src.extracted_text)::numeric, 4)
    from reports r
    cross join src
   where r.id <> src.id
     -- competition_id yerine stage_id: aynı teslim aşamasındaki raporlar.
     and r.stage_id = src.stage_id
     and (src.category_id is null or r.category_id = src.category_id)
     and r.extracted_text is not null
     and src.extracted_text is not null
     -- Tamamen ilgisiz raporları modele hiç göndermemek için taban eşik.
     and similarity(r.extracted_text, src.extracted_text) > 0.05
   order by similarity(r.extracted_text, src.extracted_text) desc
   limit p_limit;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6) Doğrulama — sessizce yarım kalmasın
-- ─────────────────────────────────────────────────────────────

do $$
declare
  n_comp int; n_stage int; n_orphan_c int; n_orphan_r int;
begin
  select count(*) into n_comp  from competitions;
  select count(*) into n_stage from report_stages;
  select count(*) into n_orphan_c from criteria where stage_id is null;
  select count(*) into n_orphan_r from reports  where stage_id is null;

  if n_stage < n_comp then
    raise exception 'HER YARIŞMAYA AŞAMA AÇILMADI: % yarışma, % aşama.', n_comp, n_stage;
  end if;
  if n_orphan_c > 0 or n_orphan_r > 0 then
    raise exception 'BAĞLANMAMIŞ SATIR VAR: % criteria, % reports.', n_orphan_c, n_orphan_r;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'reports_stage_competition_fk') then
    raise exception 'BİLEŞİK FK KURULMADI: reports_stage_competition_fk yok.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reports_one_entry_per_team_stage') then
    raise exception 'KATILIM KISITI KURULMADI: reports_one_entry_per_team_stage yok.';
  end if;

  raise notice 'ZEMA 0010 tamam: % yarışma, % aşama. criteria ve reports aşamaya bağlandı.',
    n_comp, n_stage;
end $$;
