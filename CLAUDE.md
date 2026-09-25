@AGENTS.md

# ZEMA — kalıcı çalışma kuralları

## Sürümleme: her görev bir tag

Tamamlanan HER görevden sonra commit + push'a ek olarak artan bir git tag
oluştur ve etiketi de push et:

```bash
git tag -a v0.4 -m "kısa başlık: ne değişti"
git push origin v0.4          # veya: git push --tags
```

- Numaralandırma `v0.1`'den başlar ve görev başına 0.1 artar (`v0.1`, `v0.2`,
  … `v0.9`, `v1.0`). Sonraki numarayı `git tag --sort=-v:refname | head -1`
  ile bul; tahmin etme.
- "Görev" = kullanıcının numaralı maddelerinden biri veya bağımsız bir iş
  paketi. Aynı maddeyi düzelten ara commit'ler etiketlenmez.
- Etiketler **annotated** olsun (`-a`), lightweight değil: mesaj teslim
  günü hangi sürümde ne olduğunu gösteren tek kayıt.
- Bir tag oluşturulduktan sonra ASLA taşınmaz veya silinmez. Yanlışsa
  sonraki numaradan yeni tag açılır.

Sebep: Creathon teslimi tek bir commit'e bakarak değerlendirilebiliyor;
etiketler "hangi özellik ne zaman girdi" sorusunun cevabını git geçmişinden
okunabilir kılıyor.

## Yeni tablo = aynı migration'da GRANT

30 Ekim 2026'dan itibaren Supabase, public şemasında yeni oluşturulan
tablolara Data API (PostgREST) erişimini artık otomatik GRANT etmiyor
(bkz. 0014_add_explicit_grants.sql'in başlığındaki not). Bu projede artık
GRANT'ler daraltılmış durumda — "tablo var ama kimse okuyamıyor/yazamıyor"
hatası (42501) sessizce ortaya çıkar, ilk fark edildiğinde de genelde
prod'da.

Bu yüzden **her yeni tablo migration'ı kendi GRANT'lerini de içermeli** —
0003_grants.sql'deki gibi kör `ALL ... TO anon, authenticated, service_role`
değil, o tablonun gerçekte hangi istemciyle (anon anahtar, oturumlu
istemci → `authenticated`, `supabaseAdmin()` → `service_role`) hangi
işlem için (select/insert/update/delete) kullanılacağına göre:

```sql
create table yeni_tablo (...);
alter table yeni_tablo enable row level security;
create policy ... on yeni_tablo for select to authenticated using (...);

-- Aynı dosyada, RLS politikalarıyla aynı anda:
grant select on yeni_tablo to authenticated;
grant select, insert, update on yeni_tablo to service_role;
-- serial/identity kolonu varsa sequence'i de unutma:
-- grant usage on sequence yeni_tablo_id_seq to service_role;
```

- `anon`'a yalnızca gerçekten girişsiz erişilmesi gereken tablo+işlem için
  GRANT ver (bugün tek örnek: `/api/ping` → `competitions` SELECT).
- RLS politikası "teorik olarak" bir rolün yazabileceğini söylese bile,
  kod o yolu KULLANMIYORSA (ör. admin client + `authorize()` deseni)
  GRANT verme — kullanılmayan yetki yüzeyi açık bırakma.
- `0014_add_explicit_grants.sql`'deki tablo tablo gerekçelere bak; aynı
  akıl yürütmeyi yeni tabloya da uygula.

**`correction_log` ve `evaluations` şu an grant'siz** — RLS politikaları
hazır (0002_rls.sql) ama kodda (`app/`, `lib/`, `scripts/`) bu iki tabloya
hiç `.from()` çağrısı yok, özellik uygulamaya bağlanmamış. Bu iki tablodan
biri koda bağlandığında GRANT'i **o özelliğin PR'ına değil, ayrı bir
migration'a** ekle (`000N_grant_correction_log.sql` gibi) — böylece "hangi
migration neyi açtı" git geçmişinden net okunur.
