-- ZEMA — 0017_keepalive.sql
--
-- `public.keepalive` tablosu: app/api/ping/route.ts bu tabloya service_role
-- ile upsert({ id: 1, last_ping }) yaparak Supabase free plan projesini
-- uyanık tutmak için gerçek bir YAZMA işlemi yapıyor (eski sürüm yalnızca
-- anon anahtarla bir SELECT deniyordu, RLS boş sonuç dönüyordu).
--
-- ⚠️ Bu dosya BİLEREK veritabanına UYGULANMADI — tablo elle açıldı; dosya
-- yalnızca repo ile veritabanı şemasının uyumlu kalması için ekleniyor.
--
-- GRANT (CLAUDE.md kuralı: "yeni tablo = aynı migration'da GRANT"): bu
-- tabloya kodda TEK erişim app/api/ping/route.ts → supabaseAdmin() →
-- service_role. anon/authenticated hiçbir yerde bu tabloya dokunmuyor,
-- bu yüzden onlara GRANT verilmiyor.

create table keepalive (
  id integer primary key,
  last_ping timestamptz not null default now()
);

alter table keepalive enable row level security;

grant select, insert, update on keepalive to service_role;
