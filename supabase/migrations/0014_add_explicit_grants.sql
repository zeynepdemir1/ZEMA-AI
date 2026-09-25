-- ZEMA — 0014_add_explicit_grants.sql
--
-- BAĞLAM: Supabase, 30 Ekim 2026'dan itibaren public şemasında YENİ
-- oluşturulan tablolara Data API (PostgREST) erişimini artık otomatik
-- GRANT etmeyecek. Mevcut canlı tablolar bu değişiklikten etkilenmiyor,
-- ama migration'lar sıfırdan çalıştığında (yeni proje, preview branch,
-- `supabase db reset`) o andan sonra oluşan her tablo GRANT'siz kalıp
-- API'den 42501 ("permission denied") döndürecek.
--
-- BULGU (bu migration'ı asıl gerekli kılan şey): 0003_grants.sql zaten
-- HER tabloya HER role (anon dahil) `ALL` (select+insert+update+delete)
-- veriyor — "GRANT değil RLS kısıtlasın" mantığıyla, o tarihte doğru bir
-- karardı. Ama bu, anon'un bugün her tabloda RLS'in arkasında SESSİZCE
-- tam CRUD yetkisine sahip olduğu anlamına geliyor; tek koruma RLS
-- politikalarının doğruluğu. Sadece EKLEME yapmak (0003 zaten `ALL`
-- verdiği için) hiçbir şeyi sıkılaştırmaz — bu yüzden önce 0003'ün
-- verdiği geniş yetkiyi bu dosyada REVOKE edip, sonra gerçek kod
-- kullanımına göre daraltılmış GRANT'leri veriyoruz. 0003 dosyasının
-- kendisi DEĞİŞTİRİLMEDİ (zaten uygulanmış migration'lar sabit kalır);
-- geri alma yeni bir migration'la yapılıyor.
--
-- YÖNTEM: app/, lib/, scripts/ altındaki HER `.from('<tablo>')` çağrısı
-- tek tek tarandı ve hangi istemciyle (anon anahtar, oturumlu istemci →
-- Postgres `authenticated` rolü, service_role) hangi işlemin (select/
-- insert/update/delete) yapıldığı çıkarıldı. Grant'ler bu gerçek
-- kullanıma göre — RLS politikalarının TEORİDE izin verdiğine göre değil.
-- Detaylı gerekçe: konuşma raporunda (bu migration'ı üreten görev).
--
-- ⚠️ İKİ TABLO KODDA HİÇ KULLANILMIYOR: correction_log, evaluations.
-- RLS politikaları hazır (0002_rls.sql) ama hiçbir `.from('correction_log')`
-- veya `.from('evaluations')` çağrısı yok — özellik şemada var, uygulamaya
-- bağlanmamış. Bu iki tabloya BİLEREK hiçbir GRANT verilmiyor (aşağıda not
-- var). Özellik koda bağlanınca bu migration'a ek bir GRANT bloğu gerekir.
--
-- ⚠️ audit_log: SELECT'i HİÇBİR YERDE kimse okumuyor (audit_log_select_staff
-- politikası da kullanılmıyor) — SELECT grant verilmedi. INSERT'i ise
-- neredeyse her yerde service_role ile yapılıyor, TEK istisna
-- app/evaluation/assignments/actions.ts: OTURUMLU istemciyle (authenticated)
-- audit_log'a yazmaya çalışıyor ama audit_log için authenticated'a INSERT
-- politikası YOK (yalnızca audit_log_select_staff var) — yani bu satırlar
-- muhtemelen sessizce başarısız oluyor (dönen `error` kontrol edilmiyor).
-- Bu GRANT dosyası bunu TEK BAŞINA düzeltmez (RLS politikası eksik, ayrı
-- bir konu) — authenticated'a INSERT GRANT'i bilerek VERİLMEDİ, çünkü RLS
-- politikası olmadan işe yaramaz ve "çalışıyormuş" izlenimi vermek istemedim.
-- Kod tarafı düzeltmesi ayrı: ya bu dosyayı da supabaseAdmin() kullanacak
-- şekilde değiştirin (diğer tüm action dosyalarıyla aynı desen), ya da
-- audit_log'a staff için bir INSERT politikası ekleyin.
--
-- SIRA ÖNEMLİ: önce REVOKE (0003'ün genişliğini geri al), sonra GRANT
-- (gerçek ihtiyacı ver). Fonksiyonlara (auth_role(), auth_is_staff() vb.)
-- DOKUNULMUYOR — RLS politikaları bu fonksiyonları security definer olarak
-- çağırıyor ve authenticated'ın onları EXECUTE edebilmesi gerekiyor; onları
-- da revoke etmek RLS'in tamamını kırardı. claim_analysis_jobs /
-- enqueue_report_checks / similarity_candidates zaten yalnızca service_role'e
-- EXECUTE veriyor (0004) — bu dosyada değişmiyor.
--
-- storage.objects (Storage) bu dosyanın kapsamı DIŞINDA: ayrı şema, ayrı
-- politika seti (0002_rls.sql sonunda), Supabase'in 30 Ekim değişikliği
-- yalnızca `public` şemasındaki YENİ tabloları kapsıyor.
--
-- İDEMPOTENT: REVOKE/GRANT'in ikisi de tekrar çalıştırılabilir — var olmayan
-- bir yetkiyi REVOKE etmek veya zaten var olan bir yetkiyi tekrar GRANT
-- etmek hata vermez. Canlıda güvenle yeniden çalıştırılabilir.

-- ─────────────────────────────────────────────────────────────
-- 0) 0003'ün verdiği geniş yetkiyi geri al
-- ─────────────────────────────────────────────────────────────

revoke all on all tables    in schema public from anon, authenticated, service_role;
revoke all on all sequences in schema public from anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 1) profiles
-- Okuma: kendi profili (server.ts) + staff'ın hakem listesi (assignments,
-- queries.ts) — authenticated. Yazma: YALNIZCA service_role — signUp()
-- (app/auth/actions.ts) admin.upsert ile rol atıyor, seed script'leri aynı.
-- profiles_update_own / profiles_delete_own politikaları var ama hiçbir
-- authenticated-oturum kod yolu bunları kullanmıyor (kendi adını değiştirme
-- veya "hesabımı sil" ekranı henüz yok) — bilerek GRANT verilmedi.
-- ─────────────────────────────────────────────────────────────

grant select on profiles to authenticated;
grant select, insert, update on profiles to service_role;

-- ─────────────────────────────────────────────────────────────
-- 2) competitions
-- Yazma (oluştur/güncelle/yayımla) admin/competitions/actions.ts'te
-- YALNIZCA service_role ile — competitions_write_admin politikası var
-- ama authenticated hiç bu yoldan yazmıyor (authorize() gerçek kapı).
-- anon: yalnızca app/api/ping — Supabase'i uyanık tutan uç, en küçük
-- tablodan (bkz. 0011 yorumu: "mevcut 3 gerçek yarışma") select('id')
-- çekiyor. RLS zaten anon'a satır döndürmüyor (yalnızca `to authenticated`
-- politikalar var) — bu GRANT olmadan ping 42501 alır, satır görmez ama
-- hatasız dönmesi gerekiyor (bkz. app/api/ping/route.ts yorumu).
-- ─────────────────────────────────────────────────────────────

grant select on competitions to anon;
grant select on competitions to authenticated;
grant select, insert, update on competitions to service_role;

-- ─────────────────────────────────────────────────────────────
-- 3) categories / criteria
-- Aynı desen: okuma authenticated, CRUD yalnızca service_role
-- (admin/competitions/actions.ts — kategori/kriter ekle-düzenle-sil).
-- ─────────────────────────────────────────────────────────────

grant select on categories to authenticated;
grant select, insert, update, delete on categories to service_role;

grant select on criteria to authenticated;
grant select, insert, update, delete on criteria to service_role;

-- ─────────────────────────────────────────────────────────────
-- 4) teams / team_members
-- Takım kurma akışı (app/submissions/new/actions.ts) BİLEREK service_role
-- kullanıyor (0011 sonrası yayımlanmamış yarışmaya sızma riskini kapatmak
-- için — dosya içi yorum). team_members upsert (seed) → UPDATE de gerekir.
-- Takım güncelleme (rename) hiçbir yerde yok, UPDATE teams verilmedi.
-- ─────────────────────────────────────────────────────────────

grant select on teams to authenticated;
grant select, insert, delete on teams to service_role;

grant select on team_members to authenticated;
grant select, insert, update on team_members to service_role;

-- ─────────────────────────────────────────────────────────────
-- 5) reports
-- reports_insert_own_team / reports_update_draft / reports_delete_draft
-- politikaları var (yarışmacının kendi taslağı) ama gerçek yükleme ucu
-- (app/api/reports/route.ts) service_role kullanıyor — authenticated hiç
-- doğrudan yazmıyor. Okuma her yerde authenticated (lib/reports/queries.ts).
-- ─────────────────────────────────────────────────────────────

grant select on reports to authenticated;
grant select, insert, update on reports to service_role;

-- ─────────────────────────────────────────────────────────────
-- 6) analysis_jobs
-- Yazma tamamen job runner'da (app/api/jobs/tick/route.ts, service_role).
-- Kuyruğa EKLEME claim_analysis_jobs()/enqueue_report_checks() RPC'leri
-- üzerinden (security definer, zaten yalnızca service_role EXECUTE
-- edebiliyor — 0004) — tabloya doğrudan INSERT hiçbir yerde yok.
-- ─────────────────────────────────────────────────────────────

grant select on analysis_jobs to authenticated;
grant select, update on analysis_jobs to service_role;

-- ─────────────────────────────────────────────────────────────
-- 7) analysis_results / ai_criterion_scores / similarity_pairs
-- Hakem YAZMASI (judge_note, final_text, judge_verdict) RLS'te
-- authenticated'a UPDATE politikası olarak tanımlı (0002/0006) AMA gerçek
-- kod (app/review/[id]/actions.ts, app/review/[id]/similarity/actions.ts)
-- BİLEREK service_role kullanıyor ("RLS'in ikinci savunma katmanı" —
-- dosya içi yorum, authorize() asıl kapı). Yani bu üç politika şu an
-- ÖLÜ KOD; authenticated'a UPDATE grant'i VERİLMEDİ çünkü hiçbir çalışan
-- yol onu kullanmıyor. lib/ai/run-check.ts upsert ile yazıyor (INSERT+UPDATE).
-- ─────────────────────────────────────────────────────────────

grant select on analysis_results to authenticated;
grant select, insert, update on analysis_results to service_role;

grant select on ai_criterion_scores to authenticated;
grant select, insert, update on ai_criterion_scores to service_role;

grant select on similarity_pairs to authenticated;
grant select, insert, update on similarity_pairs to service_role;

-- ─────────────────────────────────────────────────────────────
-- 8) assignments
-- TEK tablo: authenticated GERÇEKTEN yazıyor. app/evaluation/assignments/
-- actions.ts bilerek oturumlu istemci kullanıyor (dosya içi yorum: "iki
-- katman korusun"). service_role de seed script'lerinde upsert ediyor
-- (scripts/seed.ts, scripts/seed-judges.ts) — DELETE service_role'de
-- hiçbir yerde yok.
-- ─────────────────────────────────────────────────────────────

grant select, insert, update, delete on assignments to authenticated;
grant select, insert, update on assignments to service_role;

-- ─────────────────────────────────────────────────────────────
-- 9) correction_log / evaluations
-- BİLEREK GRANT YOK. Kodda (app/, lib/, scripts/) bu iki tabloya tek bir
-- `.from(...)` çağrısı bile yok — RLS politikaları hazır ama özellik
-- uygulamaya hiç bağlanmamış. Bağlandığında bu migration'a (veya yeni bir
-- migration'a) uygun GRANT eklenmeli; şimdiden vermek "çalışıyor" yanılgısı
-- yaratır ve kullanılmayan bir yetki yüzeyini açık bırakır.
-- ─────────────────────────────────────────────────────────────

-- (bilerek boş — yukarıdaki not)

-- ─────────────────────────────────────────────────────────────
-- 10) feedback
-- Kritik gizlilik kapısı (§3.1): yarışmacı yalnızca is_published=true
-- görür — bu RLS'te (feedback_select_competitor), GRANT'te değil. Yazma
-- (taslak/yayımlama) her iki review/evaluation action dosyasında da
-- service_role.
-- ─────────────────────────────────────────────────────────────

grant select on feedback to authenticated;
grant select, insert, update on feedback to service_role;

-- ─────────────────────────────────────────────────────────────
-- 11) audit_log
-- SELECT hiçbir yerde okunmuyor — grant verilmedi (audit_log_select_staff
-- politikası da şu an ölü kod). INSERT neredeyse her yerde service_role.
-- authenticated'a INSERT verilmedi — bkz. dosya başındaki ⚠️ notu:
-- app/evaluation/assignments/actions.ts'in denediği authenticated INSERT
-- için RLS politikası da eksik, bu GRANT tek başına onu çalıştırmaz.
-- Sequence: id bigserial → audit_log_id_seq, yalnızca yazan role (service_role).
-- ─────────────────────────────────────────────────────────────

grant insert on audit_log to service_role;
grant usage on sequence audit_log_id_seq to service_role;

-- ─────────────────────────────────────────────────────────────
-- 12) report_stages
-- Okuma authenticated (lib/reports/stages.ts, queries.ts). Yazma (aşama
-- oluştur / şablon düzenle) service_role — lib/reports/stages.ts
-- createStage() ve admin/competitions/actions.ts.
-- ─────────────────────────────────────────────────────────────

grant select on report_stages to authenticated;
grant select, insert, update on report_stages to service_role;

-- ─────────────────────────────────────────────────────────────
-- GÜVENLİK KİLİDİ — 0003'teki desenin aynısı: RLS kapalı tablo varsa dur.
-- REVOKE/GRANT sırası bir tabloyu yanlışlıkla RLS'siz bırakmaz (RLS ayrı
-- bir ayar) ama bu kontrol ileride biri RLS'i kapatırsa erken uyarı verir.
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
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if unprotected is not null then
    raise exception
      'RLS kapalı tablo(lar) var: %. GRANT daraltıldı ama RLS koruması yok — dur.',
      unprotected;
  end if;

  raise notice 'GRANT daraltıldı; public şemasındaki tüm tablolarda RLS hâlâ açık.';
end $$;
