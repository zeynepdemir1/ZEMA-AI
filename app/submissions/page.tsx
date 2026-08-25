import Link from 'next/link';
import { loadMySubmissions } from '@/lib/reports/queries';

import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  draft: { text: 'TASLAK', tone: 'text-ink/75 border-ink/[.45]' },
  submitted: { text: 'GÖNDERİLDİ', tone: 'text-teal-ink border-teal' },
  analyzing: { text: 'ANALİZ EDİLİYOR', tone: 'text-teal-ink border-teal' },
  analyzed: { text: 'ANALİZ TAMAM', tone: 'text-teal-ink border-teal' },
  under_review: { text: 'HAKEM İNCELEMESİNDE', tone: 'text-gold-ink border-gold' },
  completed: { text: 'TAMAMLANDI', tone: 'text-gold-ink border-gold' },
};

export default async function SubmissionsPage() {
  await requireRole(['competitor']);
  const data = await loadMySubmissions();

  if (!data) {
    return (
      <div className="flex-1 px-6 pt-11 pb-[72px] lg:px-10">
        <div className="border-ink/[.22] mx-auto max-w-[620px] border border-dashed bg-white p-10 text-center">
          <div className="font-heading mb-2 text-[18px] font-semibold">Takım bulunamadı</div>
          <div className="text-ink/75 text-[13.5px]">
            <span className="font-mono">npm run seed</span> çalıştırılmalı.
          </div>
        </div>
      </div>
    );
  }

  const deadline = data.competition.submission_deadline;

  return (
    <div className="flex-1 px-6 pt-11 pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[860px]">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-ink/75 mb-2 font-mono text-[10.5px] tracking-[.14em]">
              {data.team.name} · {data.competitor}
            </div>
            <h1 className="font-heading m-0 text-[28px] font-semibold">Raporlarım</h1>
            {deadline && (
              <div className="text-ink/75 mt-1.5 text-[13px]">
                Son başvuru:{' '}
                <span className="font-mono">
                  {new Date(deadline).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })}
                </span>
              </div>
            )}
          </div>
          <Link
            href="/submissions/new"
            className="bg-t3-blue cursor-pointer px-6 py-3 font-sans text-[14px] font-semibold text-white no-underline"
          >
            Yeni rapor yükle
          </Link>
        </div>

        {data.reports.length === 0 ? (
          <div className="border-ink/[.22] border border-dashed bg-white p-10 text-center">
            <div className="font-heading mb-2 text-[18px] font-semibold">Henüz rapor yüklemediniz</div>
            <div className="text-ink/75 mx-auto max-w-[440px] text-[13.5px] leading-[1.6]">
              PDF raporunuzu yükleyin; altı AI kontrolü otomatik çalışacak ve sonuç hakem
              incelemesine gidecek.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {data.reports.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { text: r.status.toUpperCase(), tone: 'text-ink/75 border-ink/[.45]' };
              return (
                <Link
                  key={r.id}
                  href={`/submissions/${r.id}`}
                  className={`border-ink/10 block border border-l-4 bg-white px-6 py-5 no-underline ${
                    r.feedbackPublished ? 'border-l-gold' : 'border-l-teal'
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <span className="text-ink/75 font-mono text-[11px]">{r.code}</span>
                    <span className={`border px-2 py-[3px] font-mono text-[10px] tracking-[.1em] ${st.tone}`}>
                      {st.text}
                    </span>
                    {r.feedbackPublished && (
                      <span className="bg-gold-ink px-2 py-[3px] font-mono text-[10px] tracking-[.1em] text-white">
                        ✓ GERİ BİLDİRİM HAZIR
                      </span>
                    )}
                  </div>
                  <div className="text-ink text-[16px] font-semibold">{r.title}</div>
                  <div className="text-ink/75 mt-1 text-[13px]">
                    {r.team} · {r.category}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
