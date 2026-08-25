-- ZEMA — 0012_check_type_values.sql
--
-- ESKİ "Dil ve Şablon Uyumu" (check_type = 'language_template') ÜÇE BÖLÜNDÜ
-- (hakem geri bildirimi, 26 Ağustos): tek kontrol hem zorunlu başlıkların
-- VARLIĞINI, hem raporun İÇERİĞİNİN şablonun her bölüm için istediğiyle
-- örtüşüp örtüşmediğini, hem de dil kalitesini karıştırıyordu. Üçü artık
-- ayrı kontrol — her biri kendi hakem geri bildirim kutusuyla:
--
--   required_sections    → Zorunlu Başlıklar (yalnızca varlık)
--   template_compliance  → Şablona Uygunluk (içerik + ölçülen biçim kuralları)
--   language_check       → Rapor Dili Kontrolü (dil/yazım, sayfa referanslı)
--
-- BU DOSYA YALNIZCA ENUM DEĞERLERİNİ EKLER. Postgres'te `ALTER TYPE ... ADD
-- VALUE` ile eklenen yeni değer, AYNI TRANSACTION içinde kullanılamaz
-- ("unsafe use of new value of enum type" hatası verir) — bu yüzden
-- enqueue_report_checks() fonksiyonunun yeni değerleri kullanan güncellemesi
-- AYRI bir dosyada (0013_check_types_split.sql). Bu dosyayı çalıştırıp
-- SONRA 0013'ü çalıştırın — iki ayrı "Run" gerekir, tek seferde yapıştırıp
-- çalıştırmayın.
--
-- `language_template` DEĞERİ Postgres'te KALDIRILMIYOR (enum'dan değer
-- silinemez) — eski analiz sonuçları (varsa) donmuş tarihsel kayıt olarak
-- kalıyor, hiçbir ekran onu artık okumuyor (bkz. lib/ai/config.ts CHECK_TYPES).

alter type check_type add value if not exists 'required_sections';
alter type check_type add value if not exists 'template_compliance';
alter type check_type add value if not exists 'language_check';
