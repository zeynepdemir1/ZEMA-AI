'use server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server action argümanları istemciden gelir; kimlikleri süzmeden kullanma. */
function badId(...ids: Array<string | undefined | null>): string | null {
  return ids.some((id) => !id || !UUID.test(id)) ? 'Geçersiz kimlik.' : null;
}

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/supabase/server';

/**
 * §4.4: similarity_threshold SADECE bir UI filtresi — değiştirmek yeniden
 * analiz TETİKLEMEZ, zaten hesaplanmış similarity_pairs satırları eşiğe göre
 * yorumlanır. Bu yüzden kaydetmek ucuz ve güvenli.
 */
export async function saveSimilarityThreshold(
  competitionId: string,
  value: number,
): Promise<{ ok: boolean; error?: string }> {
  // Yarışma yapılandırması yalnızca Yarışma Yöneticisinde (§3.1).
  const invalid = badId(competitionId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return { ok: false, error: auth.error };

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
    actor: auth.user.id,
    action: 'competition.threshold_changed',
    entity: 'competitions',
    entity_id: competitionId,
    meta: { similarity_threshold: value },
  });
  revalidatePath('/admin/competitions');
  return { ok: true };
}

/**
 * Şablon çıkarımını geri al.
 *
 * AI çıkarımı yanlış olabilir ve yarışma kuralları tek bir model çağrısına
 * emanet edilemez. Çıkarım sırasında eski spec `template_spec.previous`
 * altına yazılıyor; bu action onu geri yükler.
 */
export async function revertTemplateSpec(
  competitionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const invalid = badId(competitionId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return { ok: false, error: auth.error };

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('competitions')
    .select('template_spec')
    .eq('id', competitionId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: 'Yarışma bulunamadı.' };

  const spec = data.template_spec as Record<string, unknown> | null;
  const previous = spec?.previous as Record<string, unknown> | null | undefined;
  if (!previous) return { ok: false, error: 'Geri dönülecek önceki şablon yok.' };

  const { error: ue } = await db
    .from('competitions')
    .update({ template_spec: previous })
    .eq('id', competitionId);
  if (ue) return { ok: false, error: ue.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'competition.template_reverted',
    entity: 'competitions',
    entity_id: competitionId,
  });
  revalidatePath('/admin/competitions');
  return { ok: true };
}
