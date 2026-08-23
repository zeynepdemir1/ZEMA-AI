'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Hakem aksiyonları (PLAN.md §4.5).
 * "AI ile Konuş" iptal edildi — yalnızca doğrudan düzenleme ve onay/geri alma.
 *
 * ⚠️ GEÇİCİ: aktör kimliği auth'tan gelmiyor; service_role ile yazılıyor.
 */

async function judgeId(): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db.from('profiles').select('id').eq('role', 'judge').limit(1).maybeSingle();
  return data?.id ?? null;
}

/** Doğrudan düzenle → final_text yazılır ve metin hakem onaylı sayılır. */
export async function saveCriterionText(
  reportId: string,
  criterionId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = supabaseAdmin();
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Metin boş olamaz.' };

  const { error } = await db
    .from('ai_criterion_scores')
    .update({ final_text: trimmed, edit_status: 'manually_edited' })
    .eq('report_id', reportId)
    .eq('criterion_id', criterionId);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: await judgeId(),
    action: 'criterion.edited',
    entity: 'ai_criterion_scores',
    entity_id: reportId,
    meta: { criterion_id: criterionId },
  });
  revalidatePath(`/review/${reportId}`);
  return { ok: true };
}

/** Onayla ve mühürle / onayı geri al. */
export async function setCriterionApproval(
  reportId: string,
  criterionId: string,
  approved: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const db = supabaseAdmin();
  const { data: row } = await db
    .from('ai_criterion_scores')
    .select('ai_text, final_text')
    .eq('report_id', reportId)
    .eq('criterion_id', criterionId)
    .maybeSingle();

  const { error } = await db
    .from('ai_criterion_scores')
    .update({
      edit_status: approved ? 'approved' : 'ai_generated',
      // Onaylarken AI metnini final_text'e mühürle; geri alırken temizle.
      final_text: approved ? (row?.final_text ?? row?.ai_text ?? null) : null,
    })
    .eq('report_id', reportId)
    .eq('criterion_id', criterionId);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: await judgeId(),
    action: approved ? 'criterion.approved' : 'criterion.unapproved',
    entity: 'ai_criterion_scores',
    entity_id: reportId,
    meta: { criterion_id: criterionId },
  });
  revalidatePath(`/review/${reportId}`);
  return { ok: true };
}

/** "Onayla ve Gönder" — tüm kriterleri mühürle. */
export async function approveAllCriteria(
  reportId: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const db = supabaseAdmin();
  const { data: rows, error: re } = await db
    .from('ai_criterion_scores')
    .select('criterion_id, ai_text, final_text')
    .eq('report_id', reportId);
  if (re) return { ok: false, count: 0, error: re.message };

  for (const r of rows ?? []) {
    await db
      .from('ai_criterion_scores')
      .update({ edit_status: 'approved', final_text: r.final_text ?? r.ai_text })
      .eq('report_id', reportId)
      .eq('criterion_id', r.criterion_id);
  }
  await db.from('reports').update({ status: 'completed' }).eq('id', reportId);
  await db.from('audit_log').insert({
    actor: await judgeId(),
    action: 'report.review_submitted',
    entity: 'reports',
    entity_id: reportId,
    meta: { criteria: rows?.length ?? 0 },
  });
  revalidatePath(`/review/${reportId}`);
  return { ok: true, count: rows?.length ?? 0 };
}
