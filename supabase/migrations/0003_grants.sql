-- ZEMA — 0003_grants.sql
--
-- SORUN: 0001/0002 tabloları oluşturup RLS'i açtı ama API rollerine tablo
-- düzeyinde GRANT vermedi. PostgREST veritabanına anon / authenticated /
-- service_role olarak bağlanır; GRANT yoksa Postgres 42501 döndürür ve RLS
-- politikaları hiç değerlendirilmez. Sonuç: her tablo API'den erişilemez.
--
--   {"code":"42501","message":"permission denied for table competitions",
--    "hint":"GRANT SELECT ON public.competitions TO service_role;"}
--
-- Eski Supabase projelerinde `public` şeması için varsayılan ayrıcalıklar bunu
-- otomatik yapıyordu; bu projede yapmıyor, o yüzden açıkça veriyoruz.
--
-- GÜVENLİK: Geniş GRANT vermek Supabase'in standart modeli — erişimi GRANT
-- değil RLS kısıtlar. Bu yüzden dosyanın sonunda, RLS'i kapalı kalmış bir
-- tablo varsa migration'ı PATLATAN bir kontrol var. GRANT'i geniş tutup
-- RLS'e güveniyorsak, RLS'in gerçekten her yerde açık olduğunu ispatlamalıyız.

-- ─────────────────────────────────────────────────────────────
-- Şema erişimi
-- ─────────────────────────────────────────────────────────────

grant usage on schema public to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- Mevcut nesneler
-- ─────────────────────────────────────────────────────────────

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- Bundan sonra oluşturulacak nesneler (yeni migration yazınca tekrar
-- GRANT vermeyi unutmamak için)
-- ─────────────────────────────────────────────────────────────

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- GÜVENLİK KİLİDİ — RLS'siz tablo varsa buradan geçmesin
-- ─────────────────────────────────────────────────────────────

do $$
declare
  unprotected text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'          -- yalnızca normal tablolar
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception
      'RLS kapalı tablo(lar) var, GRANT güvenli değil: %. 0002_rls.sql çalıştırıldı mı?',
      unprotected;
  end if;

  raise notice 'GRANT verildi; public şemasındaki tüm tablolarda RLS açık.';
end $$;
