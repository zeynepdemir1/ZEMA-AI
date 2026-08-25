/**
 * Ek hakem hesaplarını açar ve raporları hakemler arasında yeniden dağıtır.
 *
 * NEDEN AYRI BİR BETİK: `npm run seed` yarışma, kategori, kriter, takım ve
 * atama üretiyor. Elde bilinçli olarak bırakılmış test verisi var; tam
 * seed'i tekrar çalıştırmak onlara dokunma riski taşıyor. Bu betik
 * YALNIZCA profiles/auth kullanıcısı ekler ve assignments satırlarını
 * günceller — rapor, kriter, takım veya analiz verisine DOKUNMAZ.
 *
 * Çalıştırma:  npx tsx scripts/seed-judges.ts
 * Fikirdeş (idempotent): var olan hesabı yeniden oluşturmaz, şifresini
 * bilinen değere sabitler.
 */
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD, EXTRA_JUDGES } from '../lib/dev-session';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli');
const db = createClient(url, key, { auth: { persistSession: false } });

async function upsertJudge(email: string, fullName: string): Promise<string> {
  const { data: list, error: le } = await db.auth.admin.listUsers({ perPage: 200 });
  if (le) throw new Error(`listUsers: ${le.message}`);
  let user = list.users.find((u) => u.email === email);

  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`createUser(${email}): ${error.message}`);
    user = data.user;
    console.log(`  oluşturuldu: ${email} — ${fullName}`);
  } else {
    await db.auth.admin.updateUserById(user.id, { password: DEV_PASSWORD });
    console.log(`  zaten var:   ${email} (şifre yenilendi)`);
  }

  const { error: pe } = await db.from('profiles').upsert(
    { id: user.id, role: 'judge', full_name: fullName, kvkk_consent_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  if (pe) throw new Error(`profiles upsert(${email}): ${pe.message}`);
  return user.id;
}

async function main() {
  console.log('=== 1) Ek hakem hesapları ===');
  for (const j of EXTRA_JUDGES) await upsertJudge(j.email, j.fullName);

  const { data: judges } = await db
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'judge')
    .order('full_name');
  if (!judges?.length) throw new Error('hakem bulunamadı');
  console.log(`\n=== 2) Toplam ${judges.length} hakem ===`);
  judges.forEach((j) => console.log(`  ${j.full_name}`));

  console.log('\n=== 3) Raporları yeniden dağıt ===');
  const { data: reports } = await db.from('reports').select('id, title').order('created_at');
  const { data: assigns } = await db.from('assignments').select('id, report_id, judge_id');

  /**
   * Hakemin ÜZERİNDE ÇALIŞTIĞI rapor taşınmaz: kriter metnini düzenlemiş
   * veya kontrol notu yazmışsa, raporu başka hakeme vermek onun yarım
   * kalmış işini devretmek olur. Bu satırlar mevcut hakeminde kalır.
   */
  const { data: scores } = await db
    .from('ai_criterion_scores')
    .select('report_id, edit_status');
  const { data: results } = await db.from('analysis_results').select('report_id, judge_note');
  const worked = new Set<string>([
    ...(scores ?? []).filter((s) => s.edit_status !== 'ai_generated').map((s) => s.report_id),
    ...(results ?? []).filter((r) => r.judge_note).map((r) => r.report_id),
  ]);

  const byReport = new Map((assigns ?? []).map((a) => [a.report_id, a]));
  const load = new Map(judges.map((j) => [j.id, 0]));
  for (const rid of worked) {
    const a = byReport.get(rid);
    if (a?.judge_id && load.has(a.judge_id)) load.set(a.judge_id, (load.get(a.judge_id) ?? 0) + 1);
  }

  let moved = 0;
  for (const r of reports ?? []) {
    if (worked.has(r.id)) {
      console.log(`  KORUNDU  ${r.title.slice(0, 44)}  (hakem çalışması var)`);
      continue;
    }
    // En az yüklü hakeme ver.
    const target = [...load.entries()].sort((a, b) => a[1] - b[1])[0][0];
    load.set(target, (load.get(target) ?? 0) + 1);
    const name = judges.find((j) => j.id === target)?.full_name ?? '?';

    const existing = byReport.get(r.id);
    if (existing) {
      if (existing.judge_id === target) continue;
      const { error } = await db
        .from('assignments')
        .update({ judge_id: target, status: 'pending' })
        .eq('id', existing.id);
      if (error) throw new Error(`assignments update: ${error.message}`);
    } else {
      const { error } = await db
        .from('assignments')
        .insert({ report_id: r.id, judge_id: target, status: 'pending' });
      if (error) throw new Error(`assignments insert: ${error.message}`);
    }
    moved++;
    console.log(`  → ${name.padEnd(20)} ${r.title.slice(0, 44)}`);
  }

  console.log(`\n=== 4) Sonuç ===`);
  console.log(`  değiştirilen atama: ${moved}`);
  const { data: final } = await db.from('assignments').select('judge_id');
  for (const j of judges) {
    const n = (final ?? []).filter((a) => a.judge_id === j.id).length;
    console.log(`  ${j.full_name.padEnd(22)} ${n} rapor`);
  }
  console.log(`\n  Giriş: <email> / ${DEV_PASSWORD}`);
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
