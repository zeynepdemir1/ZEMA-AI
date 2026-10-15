-- ZEMA — 0018_rollback.sql
--
-- 0018_read_only.sql'i geri alır: salt okunur vitrinin veritabanı kilidini
-- (RESTRICTIVE politikalar) kaldırır, projeyi tekrar yazılabilir yapar.
--
-- ⚠️ BU DOSYA supabase/migrations/ İÇİNDE DEĞİL — BİLEREK. Yalnızca elle,
-- bilinçli bir "projeyi canlandır" kararıyla SQL Editor'e yapıştırılıp
-- çalıştırılmalı.
--
-- Uygulama kilidini de açmayı unutmayın: Vercel'de READ_ONLY değişkenini
-- silin (ya da "false" yapın) ve redeploy edin. İkisinden biri kalırsa
-- yazmalar yine başarısız olur.
--
-- RLS ayarına dokunmaz — 0018 de dokunmadı; yalnızca kendi eklediği
-- read_only_* politikalarını siler.

do $$
declare
  t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('drop policy if exists read_only_no_insert on public.%I', t.tablename);
    execute format('drop policy if exists read_only_no_update on public.%I', t.tablename);
    execute format('drop policy if exists read_only_no_delete on public.%I', t.tablename);
  end loop;
end
$$;

drop policy if exists read_only_storage_no_insert on storage.objects;
drop policy if exists read_only_storage_no_update on storage.objects;
drop policy if exists read_only_storage_no_delete on storage.objects;
