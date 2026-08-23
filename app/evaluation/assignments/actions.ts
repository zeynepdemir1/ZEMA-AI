'use server';

import { revalidatePath } from 'next/cache';
import { authorize, supabaseServer } from '@/lib/supabase/server';

/**
 * Hakem ataması (§3.1: assignments → Değ. Yöneticisi CRUD).
 *
 * ⚠️ Bilinçli olarak OTURUMLU istemci kullanılıyor, supabaseAdmin() DEĞİL.
 * Böylece iki katman koruyor: authorize() net hata mesajı veriyor,
 * assignments_write_eval_admin politikası da Postgres tarafında engelliyor.
 * Yetki kontrolü unutulsa bile veri korunur.
 */

type Result = { ok: boolean; error?: string; changed?: number };

async function guard() {
  return authorize(['evaluation_admin']);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server action'lar HTTP endpoint'i — argümanlar istemciden geliyor ve
 * `undefined` olabilir. Doğrulamadan DB'ye geçirmek anlamsız satır yazıyor
 * (bkz. 0005_not_null_fks.sql). Kimlikleri burada da süz.
 */
function badId(...ids: Array<string | undefined | null>): string | null {
  return ids.some((id) => !id || !UUID.test(id)) ? 'Geçersiz kimlik.' : null;
}

export async function assignReport(reportId: string, judgeId: string): Promise<Result> {
  const auth = await guard();
  if ('error' in auth) return { ok: false, error: auth.error };
  const invalid = badId(reportId, judgeId);
  if (invalid) return { ok: false, error: invalid };

  const db = await supabaseServer();
  // Bir rapor tek hakeme atanır (unique report_id, judge_id) — önce eskisini kaldır.
  await db.from('assignments').delete().eq('report_id', reportId);
  const { error } = await db
    .from('assignments')
    .insert({ report_id: reportId, judge_id: judgeId, assigned_by: auth.user.id, status: 'pending' });
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'assignment.created',
    entity: 'assignments',
    entity_id: reportId,
    meta: { judge_id: judgeId },
  });
  revalidatePath('/evaluation/assignments');
  revalidatePath('/evaluation');
  return { ok: true, changed: 1 };
}

export async function unassignReport(reportId: string): Promise<Result> {
  const auth = await guard();
  if ('error' in auth) return { ok: false, error: auth.error };
  const invalid = badId(reportId);
  if (invalid) return { ok: false, error: invalid };

  const db = await supabaseServer();
  const { error } = await db.from('assignments').delete().eq('report_id', reportId);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'assignment.removed',
    entity: 'assignments',
    entity_id: reportId,
  });
  revalidatePath('/evaluation/assignments');
  revalidatePath('/evaluation');
  return { ok: true, changed: 1 };
}

/**
 * "Dengeli dağıt" (§6): ATANMAMIŞ raporları mevcut yüke göre en az yüklü
 * hakeme sırayla verir. Var olan atamalara DOKUNMAZ — hakemin yarıda
 * bıraktığı bir inceleme başkasına geçmesin.
 */
export async function distributeBalanced(): Promise<Result> {
  const auth = await guard();
  if ('error' in auth) return { ok: false, error: auth.error };

  const db = await supabaseServer();
  const { data: competition } = await db
    .from('competitions')
    .select('id')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!competition) return { ok: false, error: 'Yarışma bulunamadı.' };

  const [{ data: reports }, { data: judges }, { data: assigns }] = await Promise.all([
    db.from('reports').select('id').eq('competition_id', competition.id).order('created_at'),
    db.from('profiles').select('id').eq('role', 'judge'),
    db.from('assignments').select('report_id, judge_id'),
  ]);

  if (!judges?.length) return { ok: false, error: 'Kayıtlı hakem yok.' };

  const assigned = new Set((assigns ?? []).map((a) => a.report_id));
  const unassigned = (reports ?? []).filter((r) => !assigned.has(r.id));
  if (!unassigned.length) return { ok: true, changed: 0 };

  // Mevcut yükle başla, her atamada sayacı artır → gerçekten dengeli.
  const load = new Map(
    judges.map((j) => [j.id, (assigns ?? []).filter((a) => a.judge_id === j.id).length]),
  );

  const rows = unassigned.map((r) => {
    const target = [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
    load.set(target, (load.get(target) ?? 0) + 1);
    return { report_id: r.id, judge_id: target, assigned_by: auth.user.id, status: 'pending' };
  });

  const { error } = await db.from('assignments').insert(rows);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'assignment.distributed',
    entity: 'assignments',
    meta: { count: rows.length },
  });
  revalidatePath('/evaluation/assignments');
  revalidatePath('/evaluation');
  return { ok: true, changed: rows.length };
}
