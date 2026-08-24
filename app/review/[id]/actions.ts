'use server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server action argümanları istemciden gelir; kimlikleri süzmeden kullanma. */
function badId(...ids: Array<string | undefined | null>): string | null {
  return ids.some((id) => !id || !UUID.test(id)) ? 'Geçersiz kimlik.' : null;
}

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertReportAccess, authorize } from '@/lib/supabase/server';

/**
 * Hakem aksiyonları (PLAN.md §4.5).
 * "AI ile Konuş" iptal edildi — yalnızca doğrudan düzenleme ve onay/geri alma.
 *
 * Bu dosya supabaseAdmin() kullanıyor (RLS baypas) → her action'da rol VE
 * atama kontrolü zorunlu. Aktör oturumdan alınıyor.
 */

/** Rol + atama kontrolünü tek yerde yap. */
async function guard(reportId: string) {
  const invalid = badId(reportId);
  if (invalid) return { error: invalid };
  const auth = await authorize(['judge']);
  if ('error' in auth) return auth;
  const denied = await assertReportAccess(auth.user, reportId);
  return denied ? { error: denied } : auth;
}

/** Doğrudan düzenle → final_text yazılır ve metin hakem onaylı sayılır. */
export async function saveCriterionText(
  reportId: string,
  criterionId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await guard(reportId);
  if ('error' in auth) return { ok: false, error: auth.error };
  const badCriterion = badId(criterionId);
  if (badCriterion) return { ok: false, error: badCriterion };

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
    actor: auth.user.id,
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
  const auth = await guard(reportId);
  if ('error' in auth) return { ok: false, error: auth.error };
  const badCriterion = badId(criterionId);
  if (badCriterion) return { ok: false, error: badCriterion };

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
    actor: auth.user.id,
    action: approved ? 'criterion.approved' : 'criterion.unapproved',
    entity: 'ai_criterion_scores',
    entity_id: reportId,
    meta: { criterion_id: criterionId },
  });
  revalidatePath(`/review/${reportId}`);
  return { ok: true };
}

/**
 * Bir kontrol için hakem geri bildirim metnini kaydeder (§ dört kontrol).
 * analysis_results.judge_note — modelin payload'ına DOKUNMAZ, "AI ne dedi /
 * hakem ne dedi" ayrımı korunur.
 */
export async function saveCheckNote(
  reportId: string,
  checkType: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await guard(reportId);
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!/^[a-z_]{3,40}$/.test(checkType)) return { ok: false, error: 'Geçersiz kontrol.' };

  const db = supabaseAdmin();
  const { error } = await db
    .from('analysis_results')
    .update({ judge_note: text.trim() || null, judge_note_at: new Date().toISOString() })
    .eq('report_id', reportId)
    .eq('check_type', checkType);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'check.note_saved',
    entity: 'analysis_results',
    entity_id: reportId,
    meta: { check_type: checkType },
  });
  revalidatePath(`/review/${reportId}`);
  return { ok: true };
}

/**
 * Hakem, derlenmiş geri bildirimi onaylayıp yayıma gönderir.
 *
 * ⚠️ ROL AYRIMI: Hakem YAYIMLAMAZ. §3.1 matrisi feedback için
 * "Değ. Yöneticisi CRUD + publish" diyor ve bu ayrım bilinçli olarak
 * korunuyor. Hakemin aksiyonu taslağı KESİNLEŞTİRMEK; yayımlama tek tık
 * ötede, Değerlendirme Yöneticisi ekranında.
 */
export async function submitFeedbackDraft(
  reportId: string,
  content: {
    summary: string;
    strengths: string[];
    improvements: Array<{ area: string; what: string; how: string; priority: string }>;
    next_steps: string[];
  },
): Promise<{ ok: boolean; error?: string }> {
  const auth = await guard(reportId);
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!content.strengths.length && !content.improvements.length) {
    return { ok: false, error: 'Geri bildirim boş olamaz.' };
  }

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from('feedback')
    .select('id, is_published')
    .eq('report_id', reportId)
    .maybeSingle();
  if (existing?.is_published) {
    return { ok: false, error: 'Bu rapor için geri bildirim zaten yayımlanmış.' };
  }

  const row = { report_id: reportId, content, is_published: false };
  const { error } = existing
    ? await db.from('feedback').update(row).eq('id', existing.id)
    : await db.from('feedback').insert(row);
  if (error) return { ok: false, error: error.message };

  await db.from('reports').update({ status: 'under_review' }).eq('id', reportId);
  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'feedback.submitted_by_judge',
    entity: 'feedback',
    entity_id: reportId,
  });
  revalidatePath(`/review/${reportId}`);
  revalidatePath(`/evaluation/feedback/${reportId}`);
  return { ok: true };
}

/** "Onayla ve Gönder" — tüm kriterleri mühürle. */
export async function approveAllCriteria(
  reportId: string,
): Promise<{ ok: boolean; count: number; error?: string }> {
  const auth = await guard(reportId);
  if ('error' in auth) return { ok: false, count: 0, error: auth.error };

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
    actor: auth.user.id,
    action: 'report.review_submitted',
    entity: 'reports',
    entity_id: reportId,
    meta: { criteria: rows?.length ?? 0 },
  });
  revalidatePath(`/review/${reportId}`);
  return { ok: true, count: rows?.length ?? 0 };
}
