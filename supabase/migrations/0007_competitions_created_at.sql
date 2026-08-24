-- ZEMA — 0007_competitions_created_at.sql
--
-- SORUN: Çoklu yarışma desteği eklenirken ortaya çıktı. `competitions`
-- tablosunda oluşturulma zamanını tutan hiçbir kolon yoktu; admin
-- ekranlarının "hangi yarışmayı göstereceğim" sorusu `order by year desc
-- limit 1` ile çözülüyordu — yani "year" alanı hem yarışmanın kendi
-- verisi hem de "bu mu aktif yarışma" seçim anahtarı olarak kullanılıyordu.
--
-- Bu ikisi çakıştı: bir kullanıcı "Yarışma Bilgileri" formunda adı/yılı
-- değiştirip YENİ bir yarışma oluşturduğunu sandı, ama form aslında var
-- olan TEK satırı yerinde güncelliyordu — demo yarışmasının kimliği
-- (adı, yılı) üzerine yazıldı, kategoriler ona bağlı kaldığı için
-- "eski kategoriler yeni yarışmada görünüyor" gibi göründü.
--
-- ÇÖZÜM: gerçek bir "ne zaman oluşturuldu" kolonu ekle. Birden fazla
-- yarışma olduğunda varsayılan seçim artık EN ESKİ (ilk oluşturulan —
-- demo yarışması) kayıt; year alanı artık yalnızca görüntü verisi,
-- seçim anahtarı değil. Yeni yarışmalar competitionId açıkça seçilene
-- kadar /evaluation ve /evaluation/assignments'ta görünmez — bu bilinçli:
-- o ekranlara henüz yarışma seçici eklenmedi, demo verisini yanlışlıkla
-- gizlemesinler diye varsayılan hep ilk (demo) yarışmada sabit kalıyor.

alter table competitions
  add column if not exists created_at timestamptz not null default now();
