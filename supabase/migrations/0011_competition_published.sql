-- ZEMA — 0011_competition_published.sql
--
-- YARIŞMA ONAYI: yarışma yöneticisi şablon + kriterleri hazırlarken
-- yarışmacılar o yarışmayı GÖRMEMELİ. Şimdiye kadar `createCompetition`
-- ile açılan HER yarışma anında yarışmacı ekranında (yükleme formunun
-- yarışma seçicisinde) beliriyordu — şablon/kriter/kategori tanımlanmadan.
--
-- `is_published` yönetici "YARIŞMAYI YAYIMLA" butonuna basana kadar false
-- kalıyor; o ana kadar yarışmacı ekranı bu yarışmayı hiç listelemiyor.
--
-- GERİYE UYUMLULUK: kolon `default true` ile ekleniyor — mevcut 3 gerçek
-- yarışma (zaten yarışmacılara açık, üzerlerinde gerçek takım/rapor var)
-- otomatik yayımlı sayılıyor, hiçbir şey gizlenmiyor. Yalnızca BUNDAN
-- SONRA `createCompetition` ile açılan yarışmalar taslak (false) başlıyor
-- — action bunu açıkça override ediyor.

alter table competitions add column if not exists is_published boolean not null default true;

-- ─────────────────────────────────────────────────────────────
-- RLS: taslak yarışma yarışmacıya (ve rolsüz/anon'a) hiç görünmesin.
-- ─────────────────────────────────────────────────────────────
--
-- Personel (competition_admin/evaluation_admin) ve hakem taslağı da
-- görebilmeli — onaylamak/hazırlamak için zaten yarışmayı görmesi gerekiyor.
-- Eski politika `using (true)` idi; artık yayımlı VEYA personel/hakem.

drop policy if exists competitions_select_all on competitions;
create policy competitions_select_all on competitions
  for select to authenticated
  using (is_published = true or auth_is_staff() or auth_role() = 'judge');
