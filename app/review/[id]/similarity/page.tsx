import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  MATCHES,
  findReport,
} from '@/lib/design/mock-data';
import { SimilarityList } from './similarity-list';

export default async function SimilarityPage({
  params,
}: PageProps<'/review/[id]/similarity'>) {
  const { id } = await params;
  const report = findReport(id);
  if (!report) notFound();

  const matches = MATCHES[report.code] ?? [];
  const maxPct = matches.reduce((a, m) => Math.max(a, m.pct), 0);
  const over = maxPct >= DEFAULT_SIMILARITY_THRESHOLD;

  return (
    <div className="flex-1 px-6 pt-8 pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[1000px]">
        <Link
          href={`/review/${report.code}`}
          className="text-teal mb-[18px] inline-block text-[13px] no-underline"
        >
          ← Hakem incelemesine dön
        </Link>

        {/* Özet: TOPLAM değil, EN YÜKSEK eşleşme gösterilir (PLAN.md §4.4) */}
        <div className="border-ink/10 border-l-teal mb-5 flex flex-wrap items-center justify-between gap-8 border border-l-4 bg-white px-7 py-6">
          <div>
            <div className="text-ink/50 mb-2.5 font-mono text-[10.5px] tracking-[.14em]">
              BENZERLİK DETAYI · AI ANALİZİ
            </div>
            <h2 className="font-heading m-0 mb-1.5 text-[25px] font-semibold">
              {matches.length
                ? `${report.team} — ${matches.length} takımda benzerlik tespit edildi`
                : `${report.team} — eşik üzerinde benzerlik tespit edilmedi`}
            </h2>
            <div className="text-ink/[.62] text-[13.5px]">
              {matches.length
                ? 'Her eşleşmeyi ayrı ayrı değerlendirin. Karar verilmeyen eşleşmeler rapor kapatılamaz.'
                : 'AI taraması bu raporda eşik değerinin üzerinde bir örtüşme bulmadı.'}
            </div>
          </div>
          <div className="text-right whitespace-nowrap">
            <div className="text-ink/50 mb-[5px] font-mono text-[10px] tracking-[.1em]">
              EN YÜKSEK BENZERLİK
            </div>
            <div className={`font-mono text-[30px] ${over ? 'text-danger' : 'text-ink'}`}>
              %{maxPct}
            </div>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="border-ink/[.22] border border-dashed bg-white p-10 text-center">
            <div className="font-heading mb-2 text-[18px] font-semibold">
              Eşik üzerinde benzerlik tespit edilmedi
            </div>
            <div className="text-ink/60 text-[13.5px]">
              Bu rapor için karşılaştırma kartı oluşturulmadı; kriter değerlendirmesine devam
              edebilirsiniz.
            </div>
          </div>
        ) : (
          <SimilarityList report={report} matches={matches} />
        )}
      </div>
    </div>
  );
}
