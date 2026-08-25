import type { supabaseAdmin } from '@/lib/supabase/admin';
import type { ExtractedCriterion } from '@/lib/ai/schemas';

/**
 * Çıkarılan rubriği `criteria` tablosuna SIRA POZİSYONUNA göre eşleştirerek
 * yazar — toptan silip yeniden eklemez.
 *
 * NEDEN: `ai_criterion_scores.criterion_id` bu tabloya `on delete cascade`
 * ile bağlı. Daha önce analiz edilmiş raporların kriter bazlı AI skorları
 * var (demo veri setinde 9 rapor × 6 kriter = 54 satır, ölçüldü). Silip
 * yeniden eklemek bu 54 satırı geri getirilemez şekilde siler ve hakem
 * ekranındaki kriter kartlarını demo raporları için boşaltır.
 *
 * Bunun yerine i'inci çıkarılan kriter, i'inci MEVCUT kriterin YERİNE
 * (aynı id korunarak) güncellenir — eski skorlar yeni kriter tanımına
 * bağlı kalmaya devam eder (imkansız değil ama veri kaybından çok daha
 * iyi bir sonuç). Yalnızca fazlalık satırlar (yeni liste daha kısaysa)
 * silinir — o satırların skorları o zaman gerçekten kaybolur.
 */
export async function replaceCriteria(
  db: ReturnType<typeof supabaseAdmin>,
  competitionId: string,
  extracted: ExtractedCriterion[],
  /**
   * Rubrik AŞAMAYA bağlı (0010): her teslimin kendi kriterleri var.
   * Yalnızca bu aşamanın satırları eşleştiriliyor — başka aşamanın
   * rubriğini ezmemek için.
   */
  stageId: string,
): Promise<{ replaced: number; note?: string }> {
  const { data: existing } = await db
    .from('criteria')
    .select('id, sort_order')
    .eq('stage_id', stageId)
    .order('sort_order', { ascending: true });
  const rows = existing ?? [];

  for (let i = 0; i < extracted.length; i++) {
    const c = extracted[i];
    const payload = {
      competition_id: competitionId,
      stage_id: stageId,
      category_id: null,
      name: `${c.code} · ${c.name}`,
      description: c.description,
      max_score: c.max_score,
      weight: c.weight,
      sort_order: i + 1,
    };
    if (rows[i]) {
      await db.from('criteria').update(payload).eq('id', rows[i].id);
    } else {
      await db.from('criteria').insert(payload);
    }
  }

  let note: string | undefined;
  if (rows.length > extracted.length) {
    const excess = rows.slice(extracted.length).map((r) => r.id);
    await db.from('criteria').delete().in('id', excess);
    note = `${excess.length} eski kriter kaldırıldı — bunlara bağlı önceki AI skorları da silindi.`;
  }

  return { replaced: extracted.length, note };
}
