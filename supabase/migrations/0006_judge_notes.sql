-- ZEMA — 0006_judge_notes.sql
--
-- İHTİYAÇ: Hakem, kriter kartlarının yanı sıra DÖRT kontrolün (dil/şablon,
-- başlık-içerik, kategori, benzerlik) her biri için de düzenlenebilir bir
-- geri bildirim metni yazacak. Bu metinler, kriter metinleriyle birlikte
-- yarışmacıya gidecek nihai geri bildirimin girdisi.
--
-- NEDEN YENİ KOLON: analysis_results.payload MODELİN çıktısı; hakemin
-- yazdığı metni oraya karıştırmak "AI ne dedi / hakem ne dedi" ayrımını
-- bozar — ki bu ayrım ürünün tüm iddiası (§1). feedback.content'e koymak da
-- yayımlanmış geri bildirimi taslak girdileriyle kirletirdi.
--
-- ai_criterion_scores'taki final_text/edit_status ikilisinin kontrol
-- seviyesindeki karşılığı.

alter table analysis_results
  add column if not exists judge_note text,
  add column if not exists judge_note_at timestamptz;

comment on column analysis_results.judge_note is
  'Hakemin bu kontrol için yazdığı/onayladığı geri bildirim metni. null = hakem henüz dokunmadı.';
comment on column analysis_results.judge_note_at is
  'judge_note son güncellenme zamanı.';

-- RLS: analysis_results politikaları zaten var (hakem atandığı raporu okur,
-- yöneticiler hepsini). Ama hakemin YAZMA yetkisi yoktu — ekleniyor.
-- ai_criterion_scores_update_judge ile aynı desen.
create policy analysis_results_update_judge on analysis_results
  for update to authenticated
  using (auth_can_judge_report(report_id))
  with check (auth_can_judge_report(report_id));
