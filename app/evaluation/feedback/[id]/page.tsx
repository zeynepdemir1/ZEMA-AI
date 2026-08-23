import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadFeedbackDraft } from '@/lib/reports/queries';
import { FeedbackEditor } from './editor';

import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function FeedbackPage({ params }: PageProps<'/evaluation/feedback/[id]'>) {
  const user = await requireRole(['evaluation_admin', 'competition_admin']);
  const { id } = await params;
  const draft = await loadFeedbackDraft(id);
  if (!draft) notFound();

  return (
    <div className="flex-1 px-6 pt-8 pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[860px]">
        <Link href="/evaluation" className="text-teal mb-[18px] inline-block text-[13px] no-underline">
          ← Değerlendirme panosuna dön
        </Link>

        <div className="text-ink/50 mb-2.5 font-mono text-[10.5px] tracking-[.14em]">
          GERİ BİLDİRİM YAYIMLAMA · {draft.report.code}
        </div>
        <h1 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">{draft.report.team}</h1>
        <p className="text-ink/[.62] m-0 mb-7 text-[14px]">
          {draft.report.title} · {draft.report.category}
        </p>

        {!draft.content ? (
          <div className="border-ink/[.22] border border-dashed bg-white p-10 text-center">
            <div className="font-heading mb-2 text-[18px] font-semibold">
              Geri bildirim taslağı henüz üretilmedi
            </div>
            <div className="text-ink/60 mx-auto max-w-[520px] text-[13.5px] leading-[1.6]">
              {draft.synthesisDone
                ? 'feedback_synthesis kontrolü tamamlandı ama taslak kaydedilmemiş. Analizi yeniden çalıştırmak gerekebilir.'
                : 'feedback_synthesis kontrolü henüz tamamlanmadı. Analiz kuyruğu bitince taslak burada görünecek.'}
            </div>
          </div>
        ) : (
          <FeedbackEditor draft={draft} canPublish={user.role === 'evaluation_admin'} />
        )}
      </div>
    </div>
  );
}
