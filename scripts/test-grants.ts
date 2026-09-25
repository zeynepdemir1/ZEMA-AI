/**
 * ZEMA — 0014_add_explicit_grants.sql UYGULAMA SEVİYESİ testi.
 *
 * supabase/tests/0014_verify_grants.sql "bu rolün bu yetkisi var mı"
 * sorusunu tek tek cevaplıyor (has_table_privilege — statik, veri
 * yaratmıyor). Bu script ise KODDAKİ GERÇEK AKIŞLARI aynı istemci
 * tipleriyle (anon anahtar / oturumlu authenticated / service_role)
 * uçtan uca çalıştırıyor: giriş, rapor yükleme, analiz sonucu yazma,
 * hakem ataması ata/kaldır/dengeli-dağıt, geri bildirim, admin
 * yarışma/kategori/kriter CRUD, /api/ping, audit_log yazımı.
 *
 * Test verisini KENDİSİ oluşturur (benzersiz `RUN_ID` önekiyle — mevcut
 * seed verisiyle asla çakışmaz) ve sonunda TEMİZLER (competition cascade
 * + auth kullanıcıları). Canlı/seed verisine dokunmaz.
 *
 * Her adım PASS/FAIL yazar; FAIL olan bir adımda hangi tablo/rol/işlem
 * olduğu ve dönen hata net basılır. Sonunda özet + process.exit(1) (en az
 * bir FAIL varsa) / exit(0) (hepsi geçtiyse).
 *
 * Çalıştırma:  npm run test:grants
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY gerekli.',
  );
}

const RUN_ID = `granttest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TEST_PASSWORD = 'Zema-Grant-Test-2026!';

const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Oturumsuz anon istemci — hiçbir zaman signIn çağrılmaz, gerçek anon rolünü temsil eder.
const anon: SupabaseClient = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Verdict = 'allow' | 'deny';
type StepResult = { label: string; table: string; role: string; verdict: Verdict; ok: boolean; detail?: string };

const results: StepResult[] = [];

function isPermissionError(message: string | undefined): boolean {
  if (!message) return false;
  return /permission denied|row-level security|rls|insufficient_privilege/i.test(message);
}

/** `expected` başarmalı: hata varsa FAIL, aksi PASS. */
async function expectAllow<T>(
  label: string,
  table: string,
  role: string,
  // PostgrestFilterBuilder "thenable" ama gerçek Promise değil (catch/finally
  // yok) — PromiseLike kabul ediyoruz, await ikisini de doğru çözer.
  fn: () => PromiseLike<{ error: { message: string } | null; data?: T }>,
): Promise<void> {
  let detail: string | undefined;
  let ok = false;
  try {
    const { error } = await fn();
    ok = !error;
    detail = error?.message;
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  results.push({ label, table, role, verdict: 'allow', ok, detail });
  print(label, table, role, 'allow', ok, detail);
}

/** `expected` REDDEDİLMELİ (yetki hatası): hata yoksa ya da yetkisiz-dışı bir hataysa FAIL. */
async function expectDeny<T>(
  label: string,
  table: string,
  role: string,
  fn: () => PromiseLike<{ error: { message: string } | null; data?: T }>,
): Promise<void> {
  let detail: string | undefined;
  let ok = false;
  try {
    const { error } = await fn();
    detail = error?.message;
    ok = Boolean(error) && isPermissionError(error?.message);
    if (error && !isPermissionError(error.message)) {
      detail = `beklenmedik hata türü (yetki hatası DEĞİL): ${error.message}`;
    }
    if (!error) detail = 'HATA DÖNMEDİ — işlem beklenmedik şekilde başarılı oldu';
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  results.push({ label, table, role, verdict: 'deny', ok, detail });
  print(label, table, role, 'deny', ok, detail);
}

function print(label: string, table: string, role: string, verdict: Verdict, ok: boolean, detail?: string) {
  const tag = ok ? 'PASS' : 'FAIL';
  const expect = verdict === 'allow' ? 'izin bekleniyor' : 'ret bekleniyor';
  const line = `[${tag}] ${table.padEnd(20)} ${role.padEnd(14)} ${expect.padEnd(16)} ${label}`;
  console.log(ok ? line : `${line}\n       → ${detail}`);
}

function signedInClient(): SupabaseClient {
  return createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function main() {
  console.log(`\n=== ZEMA grant testi (${RUN_ID}) ===\n`);

  // ───────────────────────────────────────────────────────────
  // 1) Test kullanıcıları — 4 rol, hepsi benzersiz e-posta
  // ───────────────────────────────────────────────────────────
  const userDefs = [
    { key: 'competitor', role: 'competitor', email: `${RUN_ID}_competitor@example.com` },
    { key: 'judge', role: 'judge', email: `${RUN_ID}_judge@example.com` },
    { key: 'evalAdmin', role: 'evaluation_admin', email: `${RUN_ID}_evaladmin@example.com` },
    { key: 'compAdmin', role: 'competition_admin', email: `${RUN_ID}_compadmin@example.com` },
  ] as const;

  const userIds: Record<string, string> = {};
  const authClients: Record<string, SupabaseClient> = {};

  for (const u of userDefs) {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `Grant Test ${u.key}` },
    });
    if (error || !data.user) {
      console.error(`Kurulum başarısız: ${u.key} kullanıcısı oluşturulamadı — ${error?.message}`);
      process.exitCode = 1;
      return;
    }
    userIds[u.key] = data.user.id;
    const { error: pe } = await admin
      .from('profiles')
      .upsert({ id: data.user.id, role: u.role, full_name: `Grant Test ${u.key}`, kvkk_consent_at: new Date().toISOString() }, { onConflict: 'id' });
    if (pe) {
      console.error(`Kurulum başarısız: ${u.key} profili yazılamadı — ${pe.message}`);
      process.exitCode = 1;
      return;
    }

    const client = signedInClient();
    const { error: se } = await client.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
    if (se) {
      console.error(`Kurulum başarısız: ${u.key} giriş yapamadı — ${se.message}`);
      process.exitCode = 1;
      return;
    }
    authClients[u.key] = client;
  }
  console.log(`4 test kullanıcısı oluşturuldu ve giriş yapıldı (competitor/judge/evalAdmin/compAdmin).\n`);

  let competitionId = '';
  let stageId = '';
  let categoryId = '';
  let criterionId = '';
  let teamId = '';
  // İkinci, RAPORSUZ takım — "competitor reports insert edemez" testi için.
  // Aynı takımı kullansaydık status='draft' hem RLS'i hem (bugünkü geniş)
  // GRANT'i geçip reports_one_entry_per_team_stage kısıtına çarpardı; bu da
  // asıl soruyu (yetki var mı) yanıtsız bırakırdı.
  let teamId2 = '';
  let reportId = '';

  try {
    // ─────────────────────────────────────────────────────────
    // 2) Kurulum verisi — service_role ile, gerçek admin/competitions
    //    actions.ts + lib/reports/stages.ts akışının BİREBİR aynısı.
    // ─────────────────────────────────────────────────────────
    {
      const { data, error } = await admin
        .from('competitions')
        .insert({
          name: `${RUN_ID} Yarışması`,
          year: 2026,
          language: 'tr',
          created_by: userIds.compAdmin,
          similarity_threshold: 50,
          template_spec: {},
          is_published: true, // competitor'ın görebilmesi için
        })
        .select('id')
        .single();
      results.push({ label: 'kurulum: competition insert', table: 'competitions', role: 'service_role', verdict: 'allow', ok: !error, detail: error?.message });
      print('kurulum: competition insert', 'competitions', 'service_role', 'allow', !error, error?.message);
      if (error || !data) throw new Error('competition oluşturulamadı, devam edilemiyor');
      competitionId = data.id;
    }

    {
      const { count } = await admin.from('report_stages').select('id', { count: 'exact', head: true }).eq('competition_id', competitionId);
      const { data, error } = await admin
        .from('report_stages')
        .insert({ competition_id: competitionId, name: 'Ön Tasarım Raporu', sort_order: (count ?? 0) + 1, template_spec: {} })
        .select('id')
        .single();
      results.push({ label: 'kurulum: report_stages insert', table: 'report_stages', role: 'service_role', verdict: 'allow', ok: !error, detail: error?.message });
      print('kurulum: report_stages insert', 'report_stages', 'service_role', 'allow', !error, error?.message);
      if (error || !data) throw new Error('stage oluşturulamadı, devam edilemiyor');
      stageId = data.id;
    }

    {
      const { data, error } = await admin
        .from('categories')
        .insert({ competition_id: competitionId, name: `${RUN_ID} kategori`, description: 'Grant testi kategorisi.' })
        .select('id')
        .single();
      results.push({ label: 'kurulum: categories insert', table: 'categories', role: 'service_role', verdict: 'allow', ok: !error, detail: error?.message });
      print('kurulum: categories insert', 'categories', 'service_role', 'allow', !error, error?.message);
      categoryId = data?.id ?? '';
    }

    {
      const { data, error } = await admin
        .from('criteria')
        .insert({ competition_id: competitionId, stage_id: stageId, category_id: null, name: 'Test kriteri', description: 'Grant testi.', max_score: 10, weight: 1, sort_order: 1 })
        .select('id')
        .single();
      results.push({ label: 'kurulum: criteria insert', table: 'criteria', role: 'service_role', verdict: 'allow', ok: !error, detail: error?.message });
      print('kurulum: criteria insert', 'criteria', 'service_role', 'allow', !error, error?.message);
      criterionId = data?.id ?? '';
    }

    {
      const { data, error } = await admin
        .from('teams')
        .insert({ competition_id: competitionId, name: `${RUN_ID}_TAKIM`, founded_year: 2024 })
        .select('id')
        .single();
      results.push({ label: 'kurulum: teams insert', table: 'teams', role: 'service_role', verdict: 'allow', ok: !error, detail: error?.message });
      print('kurulum: teams insert', 'teams', 'service_role', 'allow', !error, error?.message);
      teamId = data?.id ?? '';
    }

    {
      const { error } = await admin.from('team_members').insert({ team_id: teamId, user_id: userIds.competitor });
      results.push({ label: 'kurulum: team_members insert', table: 'team_members', role: 'service_role', verdict: 'allow', ok: !error, detail: error?.message });
      print('kurulum: team_members insert', 'team_members', 'service_role', 'allow', !error, error?.message);
    }

    {
      // Bkz. teamId2 yorumu — rapor içermeyen ikinci takım.
      const { data, error } = await admin
        .from('teams')
        .insert({ competition_id: competitionId, name: `${RUN_ID}_TAKIM2`, founded_year: 2024 })
        .select('id')
        .single();
      teamId2 = data?.id ?? '';
      if (!error) await admin.from('team_members').insert({ team_id: teamId2, user_id: userIds.competitor });
      results.push({ label: 'kurulum: ikinci teams insert (raporsuz)', table: 'teams', role: 'service_role', verdict: 'allow', ok: !error, detail: error?.message });
      print('kurulum: ikinci teams insert (raporsuz)', 'teams', 'service_role', 'allow', !error, error?.message);
    }

    {
      const { data, error } = await admin
        .from('reports')
        .insert({
          competition_id: competitionId,
          stage_id: stageId,
          category_id: categoryId,
          team_id: teamId,
          title: `${RUN_ID} raporu`,
          file_path: `${teamId}/grant-test.pdf`,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      results.push({ label: 'kurulum: reports insert (yükleme ucu deseni)', table: 'reports', role: 'service_role', verdict: 'allow', ok: !error, detail: error?.message });
      print('kurulum: reports insert (yükleme ucu deseni)', 'reports', 'service_role', 'allow', !error, error?.message);
      reportId = data?.id ?? '';
    }

    // ─────────────────────────────────────────────────────────
    // 3) /api/ping deseni — anon, competitions'tan select('id').limit(1)
    // ─────────────────────────────────────────────────────────
    await expectAllow('/api/ping deseni: anon select competitions', 'competitions', 'anon', () =>
      anon.from('competitions').select('id').limit(1),
    );

    // ─────────────────────────────────────────────────────────
    // 4) anon — her tabloda SELECT reddedilmeli (competitions hariç)
    // ─────────────────────────────────────────────────────────
    const allTables = [
      'ai_criterion_scores', 'analysis_jobs', 'analysis_results', 'assignments',
      'audit_log', 'categories', 'criteria', 'evaluations', 'correction_log',
      'feedback', 'profiles', 'report_stages', 'reports', 'similarity_pairs',
      'team_members', 'teams',
    ];
    for (const t of allTables) {
      // count-only + head:true: hiçbir tablonun kolon adını bilmeye gerek
      // kalmaz (team_members'ta 'id' yok, bileşik PK var) ve satır dönmez.
      await expectDeny(`anon select ${t} reddedilmeli`, t, 'anon', () =>
        anon.from(t).select('*', { count: 'exact', head: true }),
      );
    }
    // anon yazma denemesi de reddedilmeli — en görünür tablo: competitions.
    await expectDeny('anon insert competitions reddedilmeli', 'competitions', 'anon', () =>
      anon.from('competitions').insert({ name: 'anon-should-fail', year: 2026 }),
    );

    // ─────────────────────────────────────────────────────────
    // 5) authenticated okuma — gerçek sayfa akışlarının aynısı
    // ─────────────────────────────────────────────────────────
    await expectAllow('competitor kendi raporunu okur', 'reports', 'authenticated(competitor)', () =>
      authClients.competitor.from('reports').select('id, title').eq('id', reportId).maybeSingle(),
    );
    await expectAllow('competitor kendi takımını okur', 'teams', 'authenticated(competitor)', () =>
      authClients.competitor.from('teams').select('id, name').eq('id', teamId).maybeSingle(),
    );
    await expectAllow('herkes competitions okur (RLS: is_published)', 'competitions', 'authenticated(competitor)', () =>
      authClients.competitor.from('competitions').select('id').eq('id', competitionId).maybeSingle(),
    );
    await expectAllow('herkes categories okur', 'categories', 'authenticated(competitor)', () =>
      authClients.competitor.from('categories').select('id').eq('id', categoryId).maybeSingle(),
    );
    await expectAllow('herkes criteria okur', 'criteria', 'authenticated(competitor)', () =>
      authClients.competitor.from('criteria').select('id').eq('id', criterionId).maybeSingle(),
    );
    await expectAllow('staff (evalAdmin) hakem listesini okur (profiles)', 'profiles', 'authenticated(evalAdmin)', () =>
      authClients.evalAdmin.from('profiles').select('id').eq('role', 'judge'),
    );
    await expectAllow('staff (evalAdmin) analysis_jobs okur', 'analysis_jobs', 'authenticated(evalAdmin)', () =>
      authClients.evalAdmin.from('analysis_jobs').select('report_id, status').eq('report_id', reportId),
    );

    // Yetkisiz yazma denemeleri — authenticated'a grant verilmedi.
    await expectDeny('competitor competitions güncelleyemez (yalnızca service_role)', 'competitions', 'authenticated(competitor)', () =>
      authClients.competitor.from('competitions').update({ name: 'hacked' }).eq('id', competitionId),
    );
    await expectDeny('competitor reports insert edemez (yükleme ucu service_role)', 'reports', 'authenticated(competitor)', () =>
      // teamId2: raporsuz takım — status='draft' RLS'i geçer (kendi takımı),
      // asıl soru GRANT'te kalır (bkz. teamId2 tanımındaki not).
      authClients.competitor.from('reports').insert({ competition_id: competitionId, stage_id: stageId, team_id: teamId2, title: 'x', file_path: 'x' }),
    );
    await expectDeny('judge ai_criterion_scores güncelleyemez (review actions service_role)', 'ai_criterion_scores', 'authenticated(judge)', () =>
      authClients.judge.from('ai_criterion_scores').update({ edit_status: 'approved' }).eq('report_id', reportId),
    );

    // ─────────────────────────────────────────────────────────
    // 6) assignments — TEK gerçek authenticated-yazma yolu
    //    (app/evaluation/assignments/actions.ts, evaluation_admin)
    // ─────────────────────────────────────────────────────────
    await expectAllow('evalAdmin hakem atar (assignments insert)', 'assignments', 'authenticated(evalAdmin)', () =>
      authClients.evalAdmin.from('assignments').insert({ report_id: reportId, judge_id: userIds.judge, assigned_by: userIds.evalAdmin, status: 'pending' }),
    );
    await expectAllow('evalAdmin atamayı günceller (distributeBalanced deseni)', 'assignments', 'authenticated(evalAdmin)', () =>
      authClients.evalAdmin.from('assignments').update({ status: 'in_progress' }).eq('report_id', reportId).eq('judge_id', userIds.judge),
    );
    await expectAllow('judge kendi atamasını okur', 'assignments', 'authenticated(judge)', () =>
      authClients.judge.from('assignments').select('id').eq('report_id', reportId).eq('judge_id', userIds.judge).maybeSingle(),
    );
    await expectAllow('evalAdmin atamayı kaldırır (unassignReport deseni)', 'assignments', 'authenticated(evalAdmin)', () =>
      authClients.evalAdmin.from('assignments').delete().eq('report_id', reportId),
    );
    // RLS katmanı: competitor (evaluation_admin değil) atama YAPAMAMALI —
    // GRANT authenticated'a INSERT verse de assignments_write_eval_admin
    // politikası rolü competitor iken reddeder. Grant testinden ayrı, RLS
    // ikinci-katman doğrulaması olarak burada.
    await expectDeny('competitor hakem atayamaz (RLS: assignments_write_eval_admin)', 'assignments', 'authenticated(competitor)', () =>
      authClients.competitor.from('assignments').insert({ report_id: reportId, judge_id: userIds.judge, assigned_by: userIds.competitor, status: 'pending' }),
    );
    // Testin geri kalanı (review akışı) için atamayı service_role ile yeniden kur.
    {
      const { error } = await admin.from('assignments').insert({ report_id: reportId, judge_id: userIds.judge, assigned_by: userIds.evalAdmin, status: 'pending' });
      if (error) console.warn(`  (not: atama yeniden kurulamadı — ${error.message})`);
    }

    // ─────────────────────────────────────────────────────────
    // 7) service_role — analiz/inceleme/geri bildirim yazma yolları
    //    (lib/ai/run-check.ts, app/review/[id]/actions.ts,
    //     app/evaluation/feedback/[id]/actions.ts ile birebir aynı desen)
    // ─────────────────────────────────────────────────────────
    await expectAllow('job runner analysis_jobs günceller (tick deseni)', 'analysis_jobs', 'service_role', () =>
      admin.from('analysis_jobs').select('id', { count: 'exact', head: true }).eq('report_id', reportId),
    );
    await expectAllow('run-check analysis_results upsert eder', 'analysis_results', 'service_role', () =>
      admin.from('analysis_results').upsert(
        { report_id: reportId, check_type: 'category_fit', score: 80, verdict: 'pass', payload: {}, model: 'grant-test', prompt_version: 'test' },
        { onConflict: 'report_id,check_type' },
      ),
    );
    await expectAllow('run-check ai_criterion_scores upsert eder', 'ai_criterion_scores', 'service_role', () =>
      admin.from('ai_criterion_scores').upsert(
        { report_id: reportId, criterion_id: criterionId, score: 8, confidence: 0.9, status: 'done', ai_text: 'test' },
        { onConflict: 'report_id,criterion_id' },
      ),
    );
    await expectAllow('review actions ai_criterion_scores günceller (saveCriterionText deseni)', 'ai_criterion_scores', 'service_role', () =>
      admin.from('ai_criterion_scores').update({ final_text: 'düzenlendi', edit_status: 'manually_edited' }).eq('report_id', reportId).eq('criterion_id', criterionId),
    );
    await expectAllow('review actions analysis_results günceller (saveCheckNote deseni)', 'analysis_results', 'service_role', () =>
      admin.from('analysis_results').update({ judge_note: 'hakem notu' }).eq('report_id', reportId).eq('check_type', 'category_fit'),
    );
    await expectAllow('feedback draft yazılır (submitFeedbackDraft deseni)', 'feedback', 'service_role', () =>
      admin.from('feedback').insert({ report_id: reportId, content: { strengths: ['x'], improvements: [], next_steps: [] }, is_published: false }),
    );
    await expectAllow('feedback yayımlanır (publish deseni)', 'feedback', 'service_role', () =>
      admin.from('feedback').update({ is_published: true, published_by: userIds.evalAdmin, published_at: new Date().toISOString() }).eq('report_id', reportId),
    );
    await expectAllow('competitor yayımlanmış feedback\'ini okur', 'feedback', 'authenticated(competitor)', () =>
      authClients.competitor.from('feedback').select('id, is_published').eq('report_id', reportId).maybeSingle(),
    );
    await expectAllow('reports status günceller (approveAllCriteria deseni)', 'reports', 'service_role', () =>
      admin.from('reports').update({ status: 'completed' }).eq('id', reportId),
    );

    // ─────────────────────────────────────────────────────────
    // 8) admin CRUD — categories/criteria/report_stages/competitions
    // ─────────────────────────────────────────────────────────
    await expectAllow('admin competitions günceller (saveCompetitionInfo deseni)', 'competitions', 'service_role', () =>
      admin.from('competitions').update({ similarity_threshold: 60 }).eq('id', competitionId),
    );
    await expectAllow('admin report_stages günceller (updateRequiredSections deseni)', 'report_stages', 'service_role', () =>
      admin.from('report_stages').update({ template_spec: { required_sections: ['giriş'] } }).eq('id', stageId),
    );
    await expectAllow('admin categories günceller', 'categories', 'service_role', () =>
      admin.from('categories').update({ description: 'güncellendi' }).eq('id', categoryId),
    );
    await expectAllow('admin criteria günceller', 'criteria', 'service_role', () =>
      admin.from('criteria').update({ weight: 2 }).eq('id', criterionId),
    );

    // ─────────────────────────────────────────────────────────
    // 9) audit_log — artık HER yerde service_role (bkz. assignments/
    //    actions.ts düzeltmesi). authenticated'ın yazamadığını da doğrula.
    // ─────────────────────────────────────────────────────────
    await expectAllow('audit_log service_role ile yazılır (logAudit deseni)', 'audit_log', 'service_role', () =>
      admin.from('audit_log').insert({ actor: userIds.evalAdmin, action: 'grant_test.audit', entity: 'reports', entity_id: reportId }),
    );
    await expectDeny('authenticated audit_log yazamaz (RLS politikası da yok)', 'audit_log', 'authenticated(evalAdmin)', () =>
      authClients.evalAdmin.from('audit_log').insert({ actor: userIds.evalAdmin, action: 'should.fail', entity: 'reports', entity_id: reportId }),
    );

    // ─────────────────────────────────────────────────────────
    // 10) correction_log / evaluations — HİÇBİR rol erişemiyor (bilerek)
    // ─────────────────────────────────────────────────────────
    await expectDeny('service_role bile correction_log okuyamaz (grant verilmedi)', 'correction_log', 'service_role', () =>
      admin.from('correction_log').select('id').limit(1),
    );
    await expectDeny('service_role bile evaluations okuyamaz (grant verilmedi)', 'evaluations', 'service_role', () =>
      admin.from('evaluations').select('id').limit(1),
    );
  } finally {
    // ───────────────────────────────────────────────────────
    // Temizlik: audit_log → competition (cascade) → auth kullanıcıları
    // ───────────────────────────────────────────────────────
    console.log('\n--- temizlik ---');
    const { error: alError } = await admin.from('audit_log').delete().in('actor', Object.values(userIds));
    console.log(alError ? `audit_log temizliği: HATA — ${alError.message}` : 'audit_log temizlendi.');

    if (competitionId) {
      const { error: ce } = await admin.from('competitions').delete().eq('id', competitionId);
      console.log(ce ? `competition temizliği: HATA — ${ce.message}` : 'competition (cascade: categories/criteria/teams/reports/…) temizlendi.');
    }

    for (const u of userDefs) {
      const id = userIds[u.key];
      if (!id) continue;
      const { error } = await admin.auth.admin.deleteUser(id);
      console.log(error ? `${u.key} kullanıcı silme: HATA — ${error.message}` : `${u.key} kullanıcısı silindi (profiles cascade).`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Özet
  // ─────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== Özet: ${results.length} adım, ${results.length - failed.length} PASS, ${failed.length} FAIL ===`);
  if (failed.length) {
    console.log('\nFAIL olan adımlar:');
    for (const f of failed) {
      console.log(`  · [${f.table} / ${f.role} / ${f.verdict === 'allow' ? 'izin bekleniyordu' : 'ret bekleniyordu'}] ${f.label}\n    → ${f.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log('Tüm adımlar geçti.');
  }
}

main().catch((e) => {
  console.error('\nBeklenmedik hata, test yarıda kaldı:', e);
  process.exitCode = 1;
});
