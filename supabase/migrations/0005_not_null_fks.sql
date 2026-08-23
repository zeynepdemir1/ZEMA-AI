-- ZEMA — 0005_not_null_fks.sql
--
-- SORUN: §3'teki şemada alt tabloların yabancı anahtarları nullable bırakılmış.
-- Bir server action argümanını doğrulamayı atlarsa `report_id: null` olan
-- anlamsız satırlar yazılabiliyor — ve `unique (report_id, judge_id)` bunu
-- ENGELLEMİYOR, çünkü Postgres unique indekslerinde NULL'lar birbirinden
-- farklı sayılır. Testte tam olarak bu oldu: assignments'a (null, null) satırı
-- girdi ve unique kısıt uyarmadı.
--
-- Uygulama katmanında doğrulama eklendi, ama tek savunma orası olmamalı.
-- Aşağıdaki kolonlar NULL olduğunda satır ANLAMSIZ; veritabanı reddetmeli.
--
-- BİLİNÇLİ OLARAK NULLABLE BIRAKILANLAR:
--   reports.category_id      → yarışmacı kategori beyan etmemiş olabilir
--   criteria.category_id     → null = kriter tüm kategoriler için geçerli
--   competitions.created_by  → seed/sistem tarafından oluşturulmuş olabilir
--   audit_log.actor          → sistem işlemleri (job runner) aktörsüz
--   feedback.published_by    → yayımlanmamış kayıtta boş

alter table reports
  alter column competition_id set not null,
  alter column team_id        set not null;

alter table categories alter column competition_id set not null;
alter table criteria   alter column competition_id set not null;
alter table teams      alter column competition_id set not null;

alter table analysis_jobs    alter column report_id set not null;
alter table analysis_results alter column report_id set not null;

alter table similarity_pairs
  alter column report_id       set not null,
  alter column other_report_id set not null;

alter table assignments
  alter column report_id set not null,
  alter column judge_id  set not null;

alter table ai_criterion_scores
  alter column report_id    set not null,
  alter column criterion_id set not null;

alter table evaluations
  alter column assignment_id set not null,
  alter column criterion_id  set not null;

alter table feedback alter column report_id set not null;

alter table correction_log
  alter column competition_id set not null,
  alter column criterion_id   set not null,
  alter column report_id      set not null;

-- Bir raporu aynı hakeme iki kez atamak da anlamsız; unique zaten var ama
-- NULL'lar kalktığı için artık gerçekten koruyor.
