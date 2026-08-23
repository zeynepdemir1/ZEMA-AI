'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { FeedbackContent } from '@/lib/reports/queries';

/**
 * §4.6 yayımlama akışı: AI taslağı `is_published=false` yazılır,
 * Değerlendirme Yöneticisi okur, düzenler, yayımlar.
 * Yarışmacı YALNIZCA yayımlanmış sürümü görür (§3.1).
 */

async function evalAdminId(): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('profiles')
    .select('id')
    .in('role', ['evaluation_admin', 'judge'])
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function saveFeedbackDraft(
  reportId: string,
  content: FeedbackContent,
): Promise<{ ok: boolean; error?: string }> {
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
  const db = supabaseAdmin();
  if (!content.strengths?.length || !content.improvements?.length) {
    return { ok: false, error: 'Güçlü yönler ve geliştirilecek alanlar boş olamaz.' };
  }

  const actor = await evalAdminId();
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
  const db = supabaseAdmin();
  const { error } = await db
    .from('feedback')
    .update({ is_published: false, published_at: null })
    .eq('report_id', reportId);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: await evalAdminId(),
    action: 'feedback.unpublished',
    entity: 'feedback',
    entity_id: reportId,
  });
  revalidatePath(`/evaluation/feedback/${reportId}`);
  revalidatePath(`/submissions/${reportId}`);
  return { ok: true };
}
