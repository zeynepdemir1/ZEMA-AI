import { notFound } from 'next/navigation';
import { loadPublishedFeedback } from '@/lib/reports/queries';

export const dynamic = 'force-dynamic';

/**
 * Yarışmacı ekranı — §3.1'in en kritik gizlilik kuralı:
 * ham AI analizi ASLA görünmez, yalnızca `feedback` tablosundaki
 * is_published=true satırı.
 */
export default async function SubmissionPage({ params }: PageProps<'/submissions/[id]'>) {
  const { id } = await params;
  const data = await loadPublishedFeedback(id);
  if (!data) notFound();

  const { report, published, content } = data;

  return (
    <div className="flex-1 px-6 pt-11 pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[900px]">
        <div
          className={`border-ink/10 mb-[22px] border border-t-[3px] bg-white px-[34px] py-[30px] ${
            published ? 'border-t-gold' : 'border-t-ink/20'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div>
              <div
                className={`mb-3 font-mono text-[10.5px] tracking-[.14em] ${
                  published ? 'text-gold' : 'text-ink/50'
                }`}
              >
                {published ? '✓ HAKEM ONAYLI · NİHAİ DEĞERLENDİRME' : 'DEĞERLENDİRME SÜRÜYOR'}
              </div>
              <h2 className="font-heading m-0 mb-2 text-[29px] font-semibold">
                {published ? 'Rapor değerlendirmeniz hazır' : 'Raporunuz değerlendirmede'}
              </h2>
              <div className="text-ink/65 text-[14.5px]">
                {report.team} · {report.category} · Rapor No{' '}
                <span className="font-mono">{report.code}</span>
              </div>
            </div>
            <div className="border-ink/10 border-l pl-7 text-right">
              <div className="text-ink/50 mb-1.5 font-mono text-[10px] tracking-[.1em]">DURUM</div>
              <div className="font-heading text-[20px] font-semibold">
                {published ? 'Yayımlandı' : 'Beklemede'}
              </div>
            </div>
          </div>
        </div>

        {!published || !content ? (
          <div className="border-ink/[.22] border border-dashed bg-white p-10 text-center">
            <div className="font-heading mb-2 text-[18px] font-semibold">
              Geri bildirim henüz yayımlanmadı
            </div>
            <div className="text-ink/60 mx-auto max-w-[520px] text-[13.5px] leading-[1.6]">
              Raporunuz analiz edildi ve hakem incelemesinde. Değerlendirme onaylanıp yayımlandığında
              güçlü yönler ve geliştirilecek alanlar bu sayfada görünecek.
            </div>
          </div>
        ) : (
          <>
            {content.summary && (
              <div className="border-ink/10 mb-5 border bg-white px-8 py-6 text-[14.5px] leading-[1.7]">
                {content.summary}
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="border-ink/10 border bg-white px-[26px] pt-[26px] pb-7">
                <div className="text-success mb-[18px] font-mono text-[10.5px] tracking-[.14em]">
                  GÜÇLÜ YÖNLER
                </div>
                <div className="flex flex-col gap-[18px]">
                  {(content.strengths ?? []).map((s, i) => (
                    <div key={i} className="border-success border-l-2 pl-[14px]">
                      <div className="text-ink/[.82] text-[13.5px] leading-[1.62]">{s}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-ink/10 border bg-white px-[26px] pt-[26px] pb-7">
                <div className="text-gold mb-[18px] font-mono text-[10.5px] tracking-[.14em]">
                  GELİŞTİRİLECEK ALANLAR
                </div>
                <div className="flex flex-col gap-[18px]">
                  {(content.improvements ?? []).map((s, i) => (
                    <div key={i} className="border-gold border-l-2 pl-[14px]">
                      <div className="mb-[5px] flex items-center gap-2">
                        <span className="text-[14.5px] font-semibold">{s.area}</span>
                        {s.priority === 'high' && (
                          <span className="text-danger border-danger border px-1.5 py-0.5 font-mono text-[9px] tracking-[.1em]">
                            ÖNCELİKLİ
                          </span>
                        )}
                      </div>
                      <div className="text-ink/70 text-[13.5px] leading-[1.62]">{s.what}</div>
                      <div className="text-ink/[.82] mt-1.5 text-[13.5px] leading-[1.62]">
                        → {s.how}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {(content.next_steps ?? []).length > 0 && (
              <div className="border-ink/10 mt-5 border bg-white px-8 py-6">
                <div className="text-ink/50 mb-3 font-mono text-[10.5px] tracking-[.14em]">
                  SONRAKİ ADIMLAR
                </div>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {(content.next_steps ?? []).map((s, i) => (
                    <li key={i} className="text-ink/[.78] flex gap-2.5 text-[13.5px] leading-[1.6]">
                      <span className="text-gold font-mono">{i + 1}.</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-ink/[.12] bg-ink/[.03] mt-[22px] flex items-center gap-[14px] border px-[22px] py-[18px]">
              <span className="text-gold font-mono text-[13px]">◆</span>
              <span className="text-ink/[.72] text-[13.5px] leading-[1.6]">
                Bu geri bildirim hakem tarafından incelenmiş ve onaylanmıştır. Sorularınız için
                yarışma sekretaryası ile iletişime geçebilirsiniz.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
