-- ZEMA — 0009_one_entry_per_team.sql
--
-- KATILIM KURALI (katman 1): bir takım, bir yarışmaya KATEGORİDEN BAĞIMSIZ
-- olarak en fazla bir kez katılabilir. Aynı takım aynı yarışmanın farklı
-- kategorilerine ayrı ayrı başvuramaz.
--
-- Bu yüzden kısıt (team_id, competition_id) üzerinde — category_id DAHİL
-- DEĞİL. Kategoriyi dahil etseydik "aynı takım üç kategoriye üç rapor"
-- geçerli olurdu; istenen tam olarak bunun engellenmesi.
--
-- Katman 2 (bir kullanıcı, bir yarışmada tek takım) uygulama tarafında:
-- app/submissions/new/actions.ts → createTeam. DB'de ifade etmek
-- team_members × teams üzerinde bir trigger gerektirirdi; katılım anında
-- açık hata mesajı göstermek istendiği için uygulama katmanı seçildi.
--
-- ─── İKİ DÜZELTME (25 Ağustos) ───
--
-- 1) SÖZDİZİMİ: `raise exception` içinde bitişik dize literalleri
--    birleştirilmeye çalışılıyordu ve aralarda `E'...'` öneki vardı.
--    PostgreSQL bitişik literal birleştirmesinde E öneki kabul etmiyor;
--    hata `42601 syntax error at or near "E'\n\nBu raporlardan..."`.
--    Artık mesaj `format(...)` ile ve açık `||` operatörleriyle kuruluyor.
--
-- 2) TEKRAR ÇALIŞTIRILABİLİRLİK: kısıt bir kez eklendikten sonra dosyanın
--    yeniden çalıştırılması "constraint already exists" ile patlıyordu.
--    Artık pg_constraint kontrolüyle sarıldı (0008'deki desenin aynısı).
--
-- Not: ilk sürüm mevcut veride çakışma varken bilinçli olarak duruyordu.
-- 25 Ağustos'ta GARO takımının 2026 yarışmasındaki 5 raporu tek rapora
-- indirildi (biri taşındı, üçü silindi), yani koruma bloğu artık geçiyor.

-- ─── 1) Çakışma var mı? Varsa anlaşılır bir hatayla dur ───
do $$
declare
  v record;
  n int := 0;
  detail text := '';
begin
  for v in
    select r.team_id,
           r.competition_id,
           count(*) as c,
           coalesce(t.name, '?') as team_name,
           coalesce(k.name, '?') as comp_name
      from reports r
      left join teams t on t.id = r.team_id
      left join competitions k on k.id = r.competition_id
     group by r.team_id, r.competition_id, t.name, k.name
    having count(*) > 1
  loop
    n := n + 1;
    detail := detail
      || format(E'\n  · %s takımı / %s → %s rapor', v.team_name, v.comp_name, v.c);
  end loop;

  if n > 0 then
    raise exception '%', format(
      'KATILIM KURALI EKLENEMEDİ: %s adet (takım, yarışma) çifti birden fazla rapor taşıyor.%s'
        || E'\n\nBu raporlardan hangisinin kalacağına karar verilmeli (silme, başka takıma '
        || 'taşıma veya arşiv alanına aktarma). Karar verildikten sonra bu migration tekrar '
        || 'çalıştırılabilir.',
      n, detail
    );
  end if;
end $$;

-- ─── 2) Kısıtı ekle (zaten varsa dokunma) ───
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'reports_one_entry_per_team_competition'
  ) then
    alter table reports
      add constraint reports_one_entry_per_team_competition
      unique (team_id, competition_id);
  end if;
end $$;
