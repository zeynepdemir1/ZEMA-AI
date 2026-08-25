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
-- ⚠️ BU MIGRATION MEVCUT VERİDE ÇAKIŞMA VARSA ÇALIŞMAZ — bilinçli olarak.
-- 25 Ağustos denetiminde GARO takımının 2026 yarışmasında 5 raporu vardı
-- (biri demo verisi, dördü elle yapılan testler). Çakışmayı sessizce
-- silmek veri kaybı olurdu; migration bunun yerine hangi çiftlerin
-- çakıştığını söyleyip duruyor. Çakışmalar çözüldükten sonra tekrar
-- çalıştırılır.
--
-- Katman 2 (bir kullanıcı, bir yarışmada tek takım) uygulama tarafında:
-- app/submissions/new/actions.ts → createTeam. DB'de ifade etmek
-- team_members × teams üzerinde bir trigger gerektirirdi; katılım anında
-- açık hata mesajı göstermek istendiği için uygulama katmanı seçildi.

do $$
declare
  v record;
  n int := 0;
  detail text := '';
begin
  for v in
    select r.team_id, r.competition_id, count(*) as c,
           coalesce(t.name, '?') as team_name,
           coalesce(k.name, '?') as comp_name
      from reports r
      left join teams t on t.id = r.team_id
      left join competitions k on k.id = r.competition_id
     group by r.team_id, r.competition_id, t.name, k.name
    having count(*) > 1
  loop
    n := n + 1;
    detail := detail || format(E'\n  · %s takımı / %s → %s rapor', v.team_name, v.comp_name, v.c);
  end loop;

  if n > 0 then
    raise exception
      'KATILIM KURALI EKLENEMEDİ: % adet (takım, yarışma) çifti birden fazla rapor taşıyor.%'
      E'\n\nBu raporlardan hangisinin kalacağına karar verilmeli (silme, başka takıma taşıma '
      'veya arşiv alanına aktarma). Karar verildikten sonra bu migration tekrar çalıştırılabilir.',
      n, detail;
  end if;
end $$;

alter table reports
  add constraint reports_one_entry_per_team_competition
  unique (team_id, competition_id);
