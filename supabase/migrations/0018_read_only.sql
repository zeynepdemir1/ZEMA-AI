-- ZEMA — 0018_read_only.sql
--
-- Salt okunur vitrin — YEDEK KİLİT. Asıl kilit uygulamada: READ_ONLY=true
-- iken her server action assertWritable() ile, her yazan route handler
-- readOnlyResponse() ile duruyor (lib/read-only.ts). Bu dosya, uygulama
-- katmanında gözden kaçan bir yol olursa veritabanının da hayır demesi için.
--
-- NE YAPIYOR:
--   1. public şemasındaki HER tabloya, anon ve authenticated için INSERT /
--      UPDATE / DELETE'i reddeden RESTRICTIVE politikalar ekler. RESTRICTIVE
--      politikalar mevcut PERMISSIVE politikalarla AND'lenir — yani 0002'deki
--      "hakem kendi atamasını güncelleyebilir" gibi izinler artık geçmez.
--      SELECT'e dokunulmaz: ekranlar okumaya devam eder.
--   2. storage.objects için aynı üç işlemi anon/authenticated'a kapatır
--      (yükleme, üzerine yazma, silme).
--
-- ⚠️ KAPSAMADIĞI ŞEY — service_role: Supabase'de service_role RLS'i BAYPAS
-- eder; RESTRICTIVE politika onu durdurmaz. Uygulamadaki yazmaların çoğu
-- supabaseAdmin() (service_role) üzerinden gidiyor. Bu yüzden bu dosya
-- tek başına projeyi salt okunur yapmaz — uygulama kilidinin yerine geçmez,
-- yanındadır. /api/ping'in keepalive upsert'ü de service_role olduğu için
-- bu migration'dan ETKİLENMEZ (bilerek: Supabase pause olmasın).
--
-- ⚠️ Oturum açma etkilenmez: signInWithPassword auth şemasına yazar,
-- public'e değil.
--
-- Yeni tablo eklenirse bu dosya onu KAPSAMAZ (politikalar uygulandığı
-- andaki tablo listesine göre oluşur) — tekrar çalıştırın; idempotent.
--
-- GERİ ALMA: supabase/rollback/0018_rollback.sql
--
-- GRANT: yeni tablo yok, GRANT değişikliği yok (CLAUDE.md kuralı burada
-- uygulanmıyor).

do $$
declare
  t record;
begin
  for t in
    select c.relname as tablename, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    -- RLS'i burada AÇMIYORUZ: politikası olmayan bir tabloda açmak SELECT'i
    -- de keserdi. Repo'daki 18 tablonun hepsinde RLS açık (0002, 0010,
    -- 0017); elle açılmış RLS'siz bir tablo varsa yalnızca uyarı verilir.
    if not t.rls then
      raise warning '0018: public.% tablosunda RLS kapalı — yedek kilit bu tabloda ETKİSİZ', t.tablename;
    end if;

    execute format('drop policy if exists read_only_no_insert on public.%I', t.tablename);
    execute format('drop policy if exists read_only_no_update on public.%I', t.tablename);
    execute format('drop policy if exists read_only_no_delete on public.%I', t.tablename);

    execute format(
      'create policy read_only_no_insert on public.%I as restrictive for insert to anon, authenticated with check (false)',
      t.tablename);
    execute format(
      'create policy read_only_no_update on public.%I as restrictive for update to anon, authenticated using (false) with check (false)',
      t.tablename);
    execute format(
      'create policy read_only_no_delete on public.%I as restrictive for delete to anon, authenticated using (false)',
      t.tablename);
  end loop;
end
$$;

-- Storage: yükleme / üzerine yazma / silme yasak. Okuma (imzalı URL ile
-- PDF açma) serbest kalıyor.
drop policy if exists read_only_storage_no_insert on storage.objects;
drop policy if exists read_only_storage_no_update on storage.objects;
drop policy if exists read_only_storage_no_delete on storage.objects;

create policy read_only_storage_no_insert on storage.objects
  as restrictive for insert to anon, authenticated with check (false);

create policy read_only_storage_no_update on storage.objects
  as restrictive for update to anon, authenticated using (false) with check (false);

create policy read_only_storage_no_delete on storage.objects
  as restrictive for delete to anon, authenticated using (false);
