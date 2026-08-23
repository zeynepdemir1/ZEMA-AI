'use server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server action argümanları istemciden gelir; kimlikleri süzmeden kullanma. */
function badId(...ids: Array<string | undefined | null>): string | null {
  return ids.some((id) => !id || !UUID.test(id)) ? 'Geçersiz kimlik.' : null;
}

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/supabase/server';
import type { FeedbackContent } from '@/lib/reports/queries';

/**
 * §4.6 yayımlama akışı: AI taslağı `is_published=false` yazılır,
 * Değerlendirme Yöneticisi okur, düzenler, yayımlar.
 * Yarışmacı YALNIZCA yayımlanmış sürümü görür (§3.1).
 */

/**
 * Yayımlama YALNIZCA Değerlendirme Yöneticisinde.
 *
 * §3.1 matrisi net: feedback → "Değ. Yöneticisi CRUD + publish",
 * "Yarışma Yön. read". Yarışma Yöneticisi sayfayı OKUYABİLİR ama
 * yayımlayamaz. Rol ayrımı şartnamenin açık gereksinimi; tek hesapla
 * demo kolaylığı için bulanıklaştırılmıyor.
 *
 * Bu dosya supabaseAdmin() kullandığı için RLS burada koruma sağlamıyor —
 * kontrol authorize() ile yapılıyor.
 */
const PUBLISHERS = ['evaluation_admin'] as const;

export async function saveFeedbackDraft(
  reportId: string,
  content: FeedbackContent,
): Promise<{ ok: boolean; error?: string }> {
  const invalid = badId(reportId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize([...PUBLISHERS]);
  if ('error' in auth) return { ok: false, error: auth.error };
  void auth;

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from('feedback')
    .select('id, is_published')
    .eq('report_id', reportId)
    .maybeSingle();

  if (existing?.is_published) {
    return { ok: false, error: 'Yayımlanmış geri bildirim düzenlenemez. Önce yayından kaldırın.' };
  }
  const row = { report_id: reportId, content, is_published: false };
  const { error } = existing
    ? await db.from('feedback').update(row).eq('id', existing.id)
    : await db.from('feedback').insert(row);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/evaluation/feedback/${reportId}`);
  return { ok: true };
}

export async function publishFeedback(
  reportId: string,
  content: FeedbackContent,
): Promise<{ ok: boolean; error?: string }> {
  const invalid = badId(reportId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize([...PUBLISHERS]);
  if ('error' in auth) return { ok: false, error: auth.error };

  const db = supabaseAdmin();
  if (!content.strengths?.length || !content.improvements?.length) {
    return { ok: false, error: 'Güçlü yönler ve geliştirilecek alanlar boş olamaz.' };
  }

  const actor = auth.user.id;
  const { data: existing } = await db
    .from('feedback')
    .select('id')
    .eq('report_id', reportId)
    .maybeSingle();

  const row = {
    report_id: reportId,
    content,
    is_published: true,
    published_by: actor,
    published_at: new Date().toISOString(),
  };
  const { error } = existing
    ? await db.from('feedback').update(row).eq('id', existing.id)
    : await db.from('feedback').insert(row);
  if (error) return { ok: false, error: error.message };

  await db.from('reports').update({ status: 'completed' }).eq('id', reportId);
  await db.from('audit_log').insert({
    actor,
    action: 'feedback.published',
    entity: 'feedback',
    entity_id: reportId,
  });

  revalidatePath(`/evaluation/feedback/${reportId}`);
  revalidatePath(`/submissions/${reportId}`);
  revalidatePath('/evaluation');
  return { ok: true };
}

export async function unpublishFeedback(
  reportId: string,
): Promise<{ ok: boolean; error?: string }> {
  const invalid = badId(reportId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize([...PUBLISHERS]);
  if ('error' in auth) return { ok: false, error: auth.error };

  const db = supabaseAdmin();
  const { error } = await db
    .from('feedback')
    .update({ is_published: false, published_at: null })
    .eq('report_id', reportId);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'feedback.unpublished',
    entity: 'feedback',
    entity_id: reportId,
  });
  revalidatePath(`/evaluation/feedback/${reportId}`);
  revalidatePath(`/submissions/${reportId}`);
  return { ok: true };
}
