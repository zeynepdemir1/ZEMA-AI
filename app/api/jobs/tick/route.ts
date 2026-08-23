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

export async function POST(req?: Request) {
  const db = supabaseAdmin();

  /**
   * İstemci hangi raporun ilerlemesini gösterdiğini bildirebilir.
   * Global `pending` sayısı ilerleme çubuğu için YANLIŞ: başka raporun
   * kuyruğu varsa çubuk 0'da takılıp sonra zıplıyor. Rapora özel sayaç
   * bu yüzden ayrıca dönüyor.
   */
  let reportId: string | null = null;
  try {
    const body = req ? await req.json() : null;
    const raw = body?.reportId;
    if (typeof raw === 'string' && /^[0-9a-f-]{36}$/i.test(raw)) reportId = raw;
  } catch {
    // Gövdesiz çağrı (cron, elle tetikleme) — sorun değil.
  }

  const { data: claimed, error: ce } = await db.rpc('claim_analysis_jobs', { p_limit: BATCH });
  if (ce) {
    return NextResponse.json({ error: `iş kapılamadı: ${ce.message}` }, { status: 500 });
  }

  const jobs = (claimed ?? []) as Job[];
  if (jobs.length === 0) {
    const pending = await countPending();
    const reportPending = reportId ? await countPending(reportId) : pending;
    return NextResponse.json({
      claimed: 0,
      results: [],
      pending,
      reportPending,
      done: reportPending === 0,
    });
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
            // HATA DÜZELTMESİ: created_at'i ilerlet, yoksa iş aynı FIFO
            // sırasına geri dönüp hemen tekrar kapılıyor → sonsuz döngü.
            // Testte tek turda 376 kez ertelendi ve kotayı boşa harcadı.
            created_at: new Date().toISOString(),
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
  const reportPending = reportId ? await countPending(reportId) : pending;
  return NextResponse.json({
    claimed: jobs.length,
    results,
    pending,
    reportPending,
    done: reportPending === 0,
  });
}

/** Tick'i cron/tarayıcıdan elle tetiklemek için GET de kabul edilir. */
export async function GET() {
  return POST(undefined);
}

async function countPending(reportId?: string): Promise<number> {
  const db = supabaseAdmin();
  let q = db
    .from('analysis_jobs')
    .select('*', { count: 'exact', head: true })
    .in('status', ['pending', 'running']);
  if (reportId) q = q.eq('report_id', reportId);
  const { count } = await q;
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
