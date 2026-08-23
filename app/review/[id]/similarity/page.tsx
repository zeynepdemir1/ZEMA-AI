import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadSimilarity } from '@/lib/reports/queries';
import { SimilarityList } from './similarity-list';

export const dynamic = 'force-dynamic';

export default async function SimilarityPage({ params }: PageProps<'/review/[id]/similarity'>) {
  const { id } = await params;
  const data = await loadSimilarity(id);
  if (!data) notFound();

  const maxPct = data.matches.reduce((a, m) => Math.max(a, m.semanticScore), 0);
  const over = maxPct >= data.threshold;
  const undecided = data.matches.filter((m) => m.verdict === 'pending').length;

  return (
    <div className="flex-1 px-6 pt-8 pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[1000px]">
        <Link href={`/review/${id}`} className="text-teal mb-[18px] inline-block text-[13px] no-underline">
          ← Hakem incelemesine dön
        </Link>

        <div className="border-ink/10 border-l-teal mb-5 flex flex-wrap items-center justify-between gap-8 border border-l-4 bg-white px-7 py-6">
          <div>
            <div className="text-ink/50 mb-2.5 font-mono text-[10.5px] tracking-[.14em]">
              BENZERLİK DETAYI · AI ANALİZİ
            </div>
            <h2 className="font-heading m-0 mb-1.5 text-[25px] font-semibold">
              {data.matches.length
                ? `${data.report.team} — ${data.matches.length} raporda benzerlik tespit edildi`
                : `${data.report.team} — eşik üzerinde benzerlik tespit edilmedi`}
            </h2>
            <div className="text-ink/[.62] text-[13.5px]">
              {data.matches.length
                ? `Her eşleşmeyi ayrı ayrı değerlendirin. ${undecided} eşleşme karar bekliyor.`
                : 'AI taraması bu raporda eşik değerinin üzerinde bir örtüşme bulmadı.'}
            </div>
          </div>
          <div className="text-right whitespace-nowrap">
            <div className="text-ink/50 mb-[5px] font-mono text-[10px] tracking-[.1em]">
              EN YÜKSEK BENZERLİK
            </div>
            <div className={`font-mono text-[30px] ${over ? 'text-danger' : 'text-ink'}`}>%{maxPct}</div>
            <div className="text-ink/[.45] mt-1 font-mono text-[10px]">EŞİK %{data.threshold}</div>
          </div>
        </div>

        {data.matches.length === 0 ? (
          <div className="border-ink/[.22] border border-dashed bg-white p-10 text-center">
            <div className="font-heading mb-2 text-[18px] font-semibold">
              Karşılaştırma kartı oluşturulmadı
            </div>
            <div className="text-ink/60 text-[13.5px]">
              Aynı yarışma ve kategoride karşılaştırılacak başka rapor bulunmuyor ya da trigram ön
              elemesi eşik üzerinde aday döndürmedi.
            </div>
          </div>
        ) : (
          <SimilarityList reportId={id} reportTeam={data.report.team} matches={data.matches} />
        )}
      </div>
    </div>
  );
}
