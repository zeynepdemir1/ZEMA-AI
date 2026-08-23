/**
 * Kuyruktaki tüm analiz işlerini GERÇEK model ile çalıştırır.
 *
 * HTTP üzerinden /api/jobs/tick çağırmıyor (auth gerekir); runCheck'i
 * doğrudan kullanıyor. Ücretsiz katmanın dakika başına istek limiti için
 * tempolu, 429/503'te artan backoff'lu.
 *
 * Çalıştırma: npm run demo:analyze
 */
import { supabaseAdmin } from '../lib/supabase/admin';
import { runCheck } from '../lib/ai/run-check';
import { CheckCallError } from '../lib/ai/call-claude-for-check';
import { MOCK_AI, DEFAULT_MODEL } from '../lib/ai/config';
import type { CheckType } from '../lib/ai/config';

const db = supabaseAdmin();
const PACE_MS = 3500;
const MAX_ATTEMPTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Job = { id: string; report_id: string; check_type: CheckType; attempts: number };

async function main() {
  console.log(`model: ${DEFAULT_MODEL} | MOCK_AI: ${MOCK_AI}`);
  if (MOCK_AI) {
    console.log('⚠ MOCK_AI açık — fixture yazılır, demo verisi gerçek olmaz.');
    console.log('  MOCK_AI=false npm run demo:analyze şeklinde çalıştır.');
    return;
  }

  const t0 = Date.now();
  let done = 0, failed = 0, deferred = 0, tokens = 0, quotaHits = 0;

  outer: for (let round = 0; round < 400; round++) {
    const { data: claimed, error } = await db.rpc('claim_analysis_jobs', { p_limit: 1 });
    if (error) throw new Error(`claim: ${error.message}`);
    const jobs = (claimed ?? []) as Job[];
    if (!jobs.length) break;

    for (const job of jobs) {
      const label = `${job.check_type}`;
      try {
        const out = await runCheck(job.report_id, job.check_type);
        if (out.kind === 'deferred') {
          // created_at ilerletilmeli, yoksa iş hemen tekrar kapılıyor.
          await db
            .from('analysis_jobs')
            .update({
              status: 'pending',
              attempts: Math.max(0, job.attempts - 1),
              started_at: null,
              created_at: new Date().toISOString(),
            })
            .eq('id', job.id);
          deferred++;
          // Kuyrukta yalnızca ertelenebilir işler kaldıysa dönmeyi bırak.
          if (deferred > 12 && done === 0) break outer;
          continue;
        }
        await db
          .from('analysis_jobs')
          .update({ status: 'done', finished_at: new Date().toISOString(), error: null })
          .eq('id', job.id);
        // Kota takibi
        const { data: res } = await db
          .from('analysis_results')
          .select('usage')
          .eq('report_id', job.report_id)
          .eq('check_type', job.check_type)
          .maybeSingle();
        const u = res?.usage as { total_tokens?: number } | null;
        tokens += u?.total_tokens ?? 0;
        done++;
        console.log(`  ✓ ${label.padEnd(20)} ${out.verdict.padEnd(22)} (${done} bitti)`);
      } catch (e) {
        const retryable = e instanceof CheckCallError ? e.retryable : true;
        const exhausted = job.attempts >= MAX_ATTEMPTS;
        const status = !retryable || exhausted ? 'failed' : 'pending';
        const msg = e instanceof Error ? e.message : String(e);
        await db
          .from('analysis_jobs')
          .update({ status, error: msg.slice(0, 1000), started_at: null })
          .eq('id', job.id);
        if (status === 'failed') failed++;
        console.log(`  ${status === 'failed' ? '✗' : '↻'} ${label.padEnd(20)} ${msg.slice(0, 70)}`);
        // Kota hatasıysa daha uzun bekle
        // 429 GÜNLÜK kota (model başına 20/gün) olabilir — bekleyerek geçmez.
        // Üst üste 3 kez 429 görürsek turu bitir, model değiştirilmeli.
        if (/429/.test(msg)) {
          quotaHits++;
          if (quotaHits >= 3) {
            console.log('\n  ⚠ Bu modelin günlük kotası tükendi (free tier: 20 istek/gün/model).');
            console.log('     GEMINI_MODEL=<başka model> ile tekrar çalıştır.');
            break outer;
          }
        } else if (/503/.test(msg)) {
          await sleep(8000);
        }
      }
      await sleep(PACE_MS);
    }
  }

  // Tamamlanan raporların durumunu ilerlet
  const { data: reports } = await db.from('reports').select('id');
  for (const r of reports ?? []) {
    const { data: left } = await db
      .from('analysis_jobs')
      .select('id')
      .eq('report_id', r.id)
      .in('status', ['pending', 'running'])
      .limit(1);
    if (!(left ?? []).length) await db.from('reports').update({ status: 'analyzed' }).eq('id', r.id);
  }

  const { count: pending } = await db
    .from('analysis_jobs')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'running']);

  console.log(`\n=== ÖZET (${Math.round((Date.now() - t0) / 1000)} sn) ===`);
  console.log(`  tamamlanan : ${done}`);
  console.log(`  başarısız  : ${failed}`);
  console.log(`  ertelenen  : ${deferred} (bağımlılık bekledi)`);
  console.log(`  kalan      : ${pending}`);
  console.log(`  token      : ${tokens.toLocaleString('tr-TR')}`);
}

main()
  .then(() => console.log('\n✓ analiz turu bitti'))
  .catch((e) => {
    console.error('\n✗ hata:', e.message);
    process.exit(1);
  });
