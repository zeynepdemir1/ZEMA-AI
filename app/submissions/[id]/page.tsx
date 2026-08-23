import { FEEDBACK_HEADER, IMPROVEMENTS, STRENGTHS } from '@/lib/design/mock-data';

/**
 * Yarışmacı ekranı — PLAN.md §3.1'in en kritik gizlilik kuralı burada:
 * ham AI analizi ASLA görünmez, yalnızca hakemin mühürlediği metin.
 */
export default async function SubmissionPage({ params }: PageProps<'/submissions/[id]'>) {
  await params; // rapor kimliği; şimdilik fixture veri gösteriliyor

  return (
    <div className="flex-1 px-6 pt-11 pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[900px]">
        <div className="border-ink/10 border-t-gold mb-[22px] border border-t-[3px] bg-white px-[34px] py-[30px]">
          <div className="flex flex-wrap items-start justify-between gap-8">
            <div>
              <div className="text-gold mb-3 font-mono text-[10.5px] tracking-[.14em]">
                ✓ HAKEM ONAYLI · NİHAİ DEĞERLENDİRME
              </div>
              <h2 className="font-heading m-0 mb-2 text-[29px] font-semibold">
                {FEEDBACK_HEADER.title}
              </h2>
              <div className="text-ink/65 text-[14.5px]">
                {FEEDBACK_HEADER.team} · {FEEDBACK_HEADER.category} · Rapor No{' '}
                <span className="font-mono">{FEEDBACK_HEADER.reportNo}</span>
              </div>
            </div>
            <div className="border-ink/10 border-l pl-7 text-right">
              <div className="text-ink/50 mb-1.5 font-mono text-[10px] tracking-[.1em]">DURUM</div>
              <div className="font-heading text-success text-[20px] font-semibold">
                {FEEDBACK_HEADER.verdict}
              </div>
              <div className="text-ink/50 mt-2 font-mono text-[11px]">{FEEDBACK_HEADER.date}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="border-ink/10 border bg-white px-[26px] pt-[26px] pb-7">
            <div className="text-success mb-[18px] font-mono text-[10.5px] tracking-[.14em]">
              GÜÇLÜ YÖNLER
            </div>
            <div className="flex flex-col gap-[18px]">
              {STRENGTHS.map((s) => (
                <div key={s.title} className="border-success border-l-2 pl-[14px]">
                  <div className="mb-[5px] text-[14.5px] font-semibold">{s.title}</div>
                  <div className="text-ink/70 text-[13.5px] leading-[1.62]">{s.text}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-ink/10 border bg-white px-[26px] pt-[26px] pb-7">
            <div className="text-gold mb-[18px] font-mono text-[10.5px] tracking-[.14em]">
              GELİŞTİRİLECEK ALANLAR
            </div>
            <div className="flex flex-col gap-[18px]">
              {IMPROVEMENTS.map((s) => (
                <div key={s.title} className="border-gold border-l-2 pl-[14px]">
                  <div className="mb-[5px] text-[14.5px] font-semibold">{s.title}</div>
                  <div className="text-ink/70 text-[13.5px] leading-[1.62]">{s.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-ink/[.12] bg-ink/[.03] mt-[22px] flex items-center gap-[14px] border px-[22px] py-[18px]">
          <span className="text-gold font-mono text-[13px]">◆</span>
          <span className="text-ink/[.72] text-[13.5px] leading-[1.6]">
            Bu geri bildirim hakem tarafından incelenmiş ve onaylanmıştır. Sorularınız için yarışma
            sekretaryası ile iletişime geçebilirsiniz.
          </span>
        </div>
      </div>
    </div>
  );
}
