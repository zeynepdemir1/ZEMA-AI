'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * §4.4: similarity_threshold SADECE bir UI filtresi — değiştirmek yeniden
 * analiz TETİKLEMEZ, zaten hesaplanmış similarity_pairs satırları eşiğe göre
 * yorumlanır. Bu yüzden kaydetmek ucuz ve güvenli.
 */
export async function saveSimilarityThreshold(
  competitionId: string,
  value: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return { ok: false, error: 'Eşik 0-100 arası tam sayı olmalı.' };
  }
  const db = supabaseAdmin();
  const { error } = await db
    .from('competitions')
    .update({ similarity_threshold: value })
    .eq('id', competitionId);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    action: 'competition.threshold_changed',
    entity: 'competitions',
    entity_id: competitionId,
    meta: { similarity_threshold: value },
  });
  revalidatePath('/admin/competitions');
  return { ok: true };
}
