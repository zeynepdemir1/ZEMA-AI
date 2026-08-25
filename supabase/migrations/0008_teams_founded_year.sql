-- ZEMA — 0008_teams_founded_year.sql
--
-- Yarışmacı, takımı olmayan bir yarışmaya rapor yüklemek istediğinde artık
-- arka planda sessizce takım AÇILMIYOR; kullanıcı bir form dolduruyor.
-- Formun ikinci alanı takımın kuruluş yılı ve `teams` tablosunda böyle bir
-- kolon yoktu (yalnızca id, competition_id, name).
--
-- NULL kabul ediliyor: bu migration'dan ÖNCE açılmış takımların (seed'in
-- oluşturduğu dokuz takım dahil) kuruluş yılı bilinmiyor ve uydurmak
-- yanlış olur. Form yeni takımlar için zorunlu tutuyor.
--
-- Üst sınır kontrolü uygulama tarafında (bulunduğumuz yıl) — CHECK ile
-- sabitlemek, yıl ilerledikçe migration gerektirirdi. Alt sınır burada:
-- 1900 öncesi bir değer veri girişi hatasıdır.

alter table teams
  add column if not exists founded_year int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_founded_year_sane'
  ) then
    alter table teams
      add constraint teams_founded_year_sane
      check (founded_year is null or founded_year between 1900 and 2200);
  end if;
end $$;
