import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { runCheck } from '@/lib/ai/run-check';
import { CheckCallError } from '@/lib/ai/call-claude-for-check';
import type { CheckType } from '@/lib/ai/config';

/**
 * POST /api/jobs/tick — analiz kuyruğunu bir tur döndürür (PLAN.md §2.1)
 *
 * Her çağrıda claim_analysis_jobs() ile FOR UPDATE SKIP LOCKED kullanarak
 * 1–2 iş kapar, çalıştırır, sonucu yazar. Tetikleyiciler:
 *   (a) yükleme sonrası client döngüde çağırır  ← ana yol
 *   (b) rapor ekranı poll ederken tetikler
 *   (c) Vercel Cron (yedek; Hobby planında sıklık çok kısıtlı, güvenilmez)
 *
 * Tek istekte 6 kontrolü çalıştırmıyoruz: Vercel'in fonksiyon süre limiti
 * demo günü timeout'a yol açardı. Küçük turlar + kısmi sonuç gösterimi.
 */

/** Bir turda kaç iş — küçük tut, süre limitine yaklaşma. */
const BATCH = 2;
/** PLAN.md §2.1: 3 denemeden sonra failed. */
const MAX_ATTEMPTS = 3;

export const maxDuration = 60;

type Job = {
  id: string;
  report_id: string;
  check_type: CheckType;
  attempts: number;
};

export async function POST() {
  const db = supabaseAdmin();

  const { data: claimed, error: ce } = await db.rpc('claim_analysis_jobs', { p_limit: BATCH });
  if (ce) {
    return NextResponse.json({ error: `iş kapılamadı: ${ce.message}` }, { status: 500 });
  }

  const jobs = (claimed ?? []) as Job[];
  if (jobs.length === 0) {
    return NextResponse.json({ claimed: 0, results: [], pending: await countPending(), done: true });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs) {
    try {
      const outcome = await runCheck(job.report_id, job.check_type);

      if (outcome.kind === 'deferred') {
        // Bağımlılık bekliyor — pending'e geri koy ve DENEMEYİ GERİ AL,
        // yoksa feedback_synthesis 3 turda boşa harcanıp failed olur.
        await db
          .from('analysis_jobs')
          .update({
            status: 'pending',
            attempts: Math.max(0, job.attempts - 1),
            started_at: null,
            error: null,
          })
          .eq('id', job.id);
        results.push({ check: job.check_type, status: 'deferred', reason: outcome.reason });
        continue;
      }

      await db
        .from('analysis_jobs')
        .update({ status: 'done', finished_at: new Date().toISOString(), error: null })
        .eq('id', job.id);
      results.push({
        check: job.check_type,
        status: 'done',
        verdict: outcome.verdict,
        mocked: outcome.mocked,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // §5.3: yeniden denenebilir mi? CheckCallError bunu taşıyor.
      const retryable = e instanceof CheckCallError ? e.retryable : true;
      const exhausted = job.attempts >= MAX_ATTEMPTS;
      const finalStatus = !retryable || exhausted ? 'failed' : 'pending';

      await db
        .from('analysis_jobs')
        .update({
          status: finalStatus,
          error: message.slice(0, 1000),
          started_at: null,
          finished_at: finalStatus === 'failed' ? new Date().toISOString() : null,
        })
        .eq('id', job.id);

      results.push({
        check: job.check_type,
        status: finalStatus,
        attempts: job.attempts,
        retryable,
        error: message.slice(0, 200),
      });
    }
  }

  // Bir raporun tüm işleri bittiyse durumunu ilerlet.
  await advanceReportStatuses(jobs.map((j) => j.report_id));

  const pending = await countPending();
  return NextResponse.json({ claimed: jobs.length, results, pending, done: pending === 0 });
}

/** Tick'i cron/tarayıcıdan elle tetiklemek için GET de kabul edilir. */
export async function GET() {
  return POST();
}

async function countPending(): Promise<number> {
  const db = supabaseAdmin();
  const { count } = await db
    .from('analysis_jobs')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'running']);
  return count ?? 0;
}

async function advanceReportStatuses(reportIds: string[]) {
  const db = supabaseAdmin();
  for (const id of new Set(reportIds)) {
    const { data: remaining } = await db
      .from('analysis_jobs')
      .select('id')
      .eq('report_id', id)
      .in('status', ['pending', 'running'])
      .limit(1);
    if ((remaining ?? []).length === 0) {
      await db.from('reports').update({ status: 'analyzed' }).eq('id', id);
    }
  }
}
