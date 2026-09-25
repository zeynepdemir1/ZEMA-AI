-- ZEMA — 0014_rollback.sql
--
-- 0014_add_explicit_grants.sql'i geri alır: 0003_grants.sql'in verdiği
-- GENİŞ yetkiyi (anon dahil her role her tabloda ALL) birebir geri getirir.
--
-- 0015_test_cleanup_grants.sql'i de KAPSAR — ALL, DELETE dahil her şeyin
-- üst kümesi olduğu için ayrı bir adım gerekmez.
--
-- ⚠️ BU DOSYA supabase/migrations/ İÇİNDE DEĞİL — BİLEREK. Migration
-- klasöründeki her şey otomatik/sırayla uygulanabilir varsayılıyor; bu
-- dosya YALNIZCA elle, bilinçli bir geri alma kararıyla SQL Editor'e
-- yapıştırılıp çalıştırılmalı. Asla "diğer migration'larla birlikte
-- çalıştır" akışına dahil etmeyin.
--
-- NE ZAMAN KULLANILIR: 0014'ü uyguladıktan sonra uygulamada beklenmedik bir
-- 42501 ("permission denied") hatası çıkarsa VE hızlıca eski (güvensiz ama
-- çalışan) duruma dönmeniz gerekiyorsa. Kalıcı çözüm değildir — 0014'teki
-- grant matrisinde eksik kalan bir satırı bulup DÜZELTMEK asıl çözüm;
-- bu dosya yalnızca "önce eski hale dön, sonra sakin sakin düzelt" için.
--
-- GÜVENLİK UYARISI: bunu çalıştırdığınız an anon rolü YENİDEN her tabloda
-- tam CRUD yetkisine (RLS'in arkasında) kavuşur — 0014 öncesindeki durum
-- tam olarak buydu. Kalıcı olarak bu dosyada kalmayın.
--
-- YÖNTEM: GRANT toplamsaldır (additive) — 0014'ün verdiği dar GRANT'leri
-- REVOKE etmeye gerek yok, üstüne ALL grant etmek onları zaten kapsar
-- (bir role hem SELECT hem sonradan ALL verilirse sonuç ALL'dur, aradaki
-- fark kaybolmaz). Bu yüzden burada sadece 0003'ün YAPTIĞI şeyi birebir
-- tekrar ediyoruz.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- Doğrulama: anon'un artık her tabloda INSERT yetkisi olduğunu (0003
-- öncesi/0014 sonrası eski davranış) tek satırda göster.
select
  table_name,
  has_table_privilege('anon', 'public.' || table_name, 'INSERT') as anon_can_insert
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
