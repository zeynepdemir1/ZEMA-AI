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
/**
 * Raporları hakemler arasında dengeli dağıt.
 *
 * `mode: 'fill'`      — yalnızca ATANMAMIŞ raporları dağıtır (varsayılan).
 * `mode: 'rebalance'` — mevcut atamaları da yeniden dağıtır.
 *
 * Neden iki mod: 'fill' her şey atanmışken hiçbir şey yapmıyordu ve düğme
 * ölü görünüyordu. Tek hakem varken bütün raporlar ona yığılıyor, sonradan
 * hakem eklenince dağıtacak bir yol kalmıyordu.
 *
 * ⚠️ REBALANCE, HAKEMİN ÇALIŞTIĞI RAPORU TAŞIMAZ. Kriter metnini düzenlemiş
 * veya kontrol notu yazmış bir hakemin raporunu başka hakeme vermek, yarım
 * kalmış işi devretmek olur. O satırlar mevcut hakeminde bırakılıyor.
 */
export async function distributeBalanced(
  mode: 'fill' | 'rebalance' = 'fill',
): Promise<Result> {
  const auth = await guard();
  if ('error' in auth) return { ok: false, error: auth.error };

  const db = await supabaseServer();
  // Varsayılan yarışma seçimi loadSetup/loadDashboard ile AYNI olmalı:
  // ilk oluşturulan (0007), beraberlikte id. Burada `year desc` kalmıştı,
  // yani dağıtım ekranda görünenden BAŞKA bir yarışmanın raporlarını
  // dağıtabilirdi.
  const { data: competition } = await db
    .from('competitions')
    .select('id')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!competition) return { ok: false, error: 'Yarışma bulunamadı.' };

  const [{ data: reports }, { data: judges }, { data: assigns }] = await Promise.all([
    db.from('reports').select('id').eq('competition_id', competition.id).order('created_at'),
    db.from('profiles').select('id').eq('role', 'judge'),
    db.from('assignments').select('report_id, judge_id'),
  ]);

  if (!judges?.length) return { ok: false, error: 'Kayıtlı hakem yok.' };

  const byReport = new Map((assigns ?? []).map((a) => [a.report_id, a]));

  // Hakemin üzerinde çalıştığı raporlar taşınmaz.
  const [{ data: scores }, { data: results }] = await Promise.all([
    db.from('ai_criterion_scores').select('report_id, edit_status'),
    db.from('analysis_results').select('report_id, judge_note'),
  ]);
  const worked = new Set<string>([
    ...(scores ?? []).filter((s) => s.edit_status !== 'ai_generated').map((s) => s.report_id),
    ...(results ?? []).filter((r) => r.judge_note).map((r) => r.report_id),
  ]);

  const movable = (reports ?? []).filter((r) => {
    if (worked.has(r.id)) return false;
    return mode === 'rebalance' ? true : !byReport.has(r.id);
  });
  if (!movable.length) return { ok: true, changed: 0 };

  // Taşınmayan raporların yükü baştan sayılıyor → sonuç gerçekten dengeli.
  const load = new Map(judges.map((j) => [j.id, 0]));
  for (const [rid, a] of byReport) {
    const stays = mode === 'rebalance' ? worked.has(rid) : true;
    if (stays && a.judge_id && load.has(a.judge_id)) {
      load.set(a.judge_id, (load.get(a.judge_id) ?? 0) + 1);
    }
  }

  let changed = 0;
  for (const r of movable) {
    const target = [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
    load.set(target, (load.get(target) ?? 0) + 1);
    const existing = byReport.get(r.id);
    if (existing) {
      if (existing.judge_id === target) continue;
      const { error } = await db
        .from('assignments')
        .update({ judge_id: target, assigned_by: auth.user.id, status: 'pending' })
        .eq('report_id', r.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await db
        .from('assignments')
        .insert({ report_id: r.id, judge_id: target, assigned_by: auth.user.id, status: 'pending' });
      if (error) return { ok: false, error: error.message };
    }
    changed++;
  }

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'assignment.distributed',
    entity: 'assignments',
    meta: { count: changed, mode, protected: [...worked].length },
  });
  revalidatePath('/evaluation/assignments');
  revalidatePath('/evaluation');
  return { ok: true, changed };
}
