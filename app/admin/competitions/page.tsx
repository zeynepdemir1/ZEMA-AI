import { loadSetup } from '@/lib/reports/queries';
import { ThresholdCard } from './threshold-card';

import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const STEPS = [
  ['1', 'Yarışma bilgileri'],
  ['2', 'Şablon ve kriterler'],
  ['3', 'Hakem ataması'],
] as const;

export default async function CompetitionSetupPage() {
  await requireRole(['competition_admin']);
  const data = await loadSetup();

  if (!data) {
    return (
      <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
        <div className="border-ink/[.22] mx-auto max-w-[680px] border border-dashed bg-white p-10 text-center">
          <div className="font-heading mb-2 text-[18px] font-semibold">Tanımlı yarışma yok</div>
          <div className="text-ink/60 text-[13.5px]">
            <span className="font-mono">npm run seed</span> ile örnek yarışma, kategoriler ve rubrik
            oluşturulabilir.
          </div>
        </div>
      </div>
    );
  }

  const { competition, categories, criteria, overThresholdPct } = data;
  const reportCount = categories.reduce((a, c) => a + c.reportCount, 0);
  const sections = competition.template_spec.required_sections ?? [];
  // Adım 3 (hakem ataması) henüz yok — tamamlanan adımları veriden türet.
  const completed = criteria.length > 0 ? 2 : 1;

  return (
    <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[980px]">
        <div className="mb-[30px] flex flex-wrap items-center">
          {STEPS.map(([num, label], i) => {
            const active = i < completed;
            return (
              <div
                key={num}
                className={`border-ink/[.12] flex flex-1 items-center gap-2.5 border px-5 py-3 ${
                  i > 0 ? 'border-l-0' : ''
                } ${active ? 'text-ink bg-white' : 'text-ink/[.45] bg-transparent'}`}
              >
                <span
                  className={`flex h-[22px] w-[22px] items-center justify-center border font-mono text-[11px] ${
                    active ? 'border-ink bg-ink text-white' : 'border-ink/[.25] text-ink/50 bg-transparent'
                  }`}
                >
                  {num}
                </span>
                <span className="text-[13.5px] font-medium">{label}</span>
              </div>
            );
          })}
        </div>

        <h2 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">{competition.name}</h2>
        <p className="text-ink/[.62] m-0 mb-7 text-[14.5px]">
          Şablon ve kriterler, AI&apos;nin analiz sırasında kullandığı referanstır — bu sayfadaki
          değerler doğrudan prompt&apos;a giriyor.
        </p>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="border-ink/10 border bg-white p-[26px]">
            <div className="text-ink/60 mb-[7px] font-mono text-[10.5px] tracking-[.12em]">
              YARIŞMA
            </div>
            <div className="border-ink/[.14] mb-[18px] border px-[14px] py-3 text-[14.5px]">
              {competition.name}
              <span className="text-ink/50 ml-2 font-mono text-[11px]">{competition.year}</span>
            </div>

            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-ink/60 font-mono text-[10.5px] tracking-[.12em]">
                KATEGORİLER
              </span>
              <span className="text-ink/[.45] font-mono text-[11px]">{categories.length} ADET</span>
            </div>
            <div className="mb-[18px] flex flex-col gap-1.5">
              {categories.map((c) => (
                <div key={c.id} className="border-ink/[.12] border px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-medium">{c.name}</span>
                    <span className="text-ink/[.45] font-mono text-[10.5px]">
                      {c.reportCount} RAPOR
                    </span>
                  </div>
                  <div className="text-ink/[.55] mt-1 text-[12px] leading-[1.5]">
                    {c.description.slice(0, 120)}
                    {c.description.length > 120 ? '…' : ''}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-ink/60 mb-[7px] font-mono text-[10.5px] tracking-[.12em]">
              {(competition.template_spec.report_type ?? 'RAPOR').toLocaleUpperCase('tr-TR')} ŞABLONU
              {' — '}
              {(competition.template_spec.required_sections ?? []).length} ZORUNLU BÖLÜM
            </div>
            <div className="border-ink/[.28] bg-ink/[.02] mb-5 border border-dashed px-4 py-3">
              {sections.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {sections.map((s) => (
                    <span
                      key={s}
                      className="border-ink/[.18] text-ink/70 border bg-white px-2 py-1 font-mono text-[10.5px]"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-ink/50 text-[12.5px]">Şablon tanımlanmamış.</div>
              )}
              <div className="text-ink/[.45] mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px]">
                <span>{competition.template_spec.format?.font ?? '—'}</span>
                <span>{competition.template_spec.format?.page ?? '—'}</span>
                <span>{competition.template_spec.format?.alignment ?? '—'}</span>
                <span>MAKS. {competition.template_spec.format?.max_pages ?? '—'} SAYFA</span>
                <span>ATIF {competition.template_spec.citation_format ?? '—'}</span>
              </div>
              {competition.template_spec.format?.footer && (
                <div className="text-ink/[.45] mt-1 font-mono text-[10.5px]">
                  ALTBİLGİ: {competition.template_spec.format.footer}
                </div>
              )}
            </div>

            {(competition.template_spec.content_rules ?? []).length > 0 && (
              <div className="border-ink/[.12] mb-5 border-l-2 pl-3">
                <div className="text-ink/60 mb-1.5 font-mono text-[10px] tracking-[.12em]">
                  İÇERİK KURALLARI
                </div>
                <ul className="text-ink/[.72] m-0 list-disc pl-4 text-[12.5px] leading-[1.6]">
                  {(competition.template_spec.content_rules ?? []).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-ink/60 font-mono text-[10.5px] tracking-[.12em]">
                DEĞERLENDİRME KRİTERLERİ
              </span>
              <span className="text-ink/[.45] font-mono text-[11px]">
                {`${criteria.length} KRİTER · TOPLAM %${criteria.reduce((a, c) => a + c.weightPct, 0)}`}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {criteria.map((k) => (
                <div key={k.id} className="border-ink/[.12] flex items-center gap-3 border px-3 py-2.5">
                  <span className="text-ink/[.45] font-mono text-[10.5px]">{k.code}</span>
                  <span className="text-[13.5px]">{k.title}</span>
                  <span className="text-ink/[.45] ml-auto font-mono text-[11px]">
                    %{k.weightPct} · maks {k.maxScore}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <ThresholdCard
              competitionId={competition.id}
              initial={competition.similarity_threshold}
              overThresholdPct={overThresholdPct}
              reportCount={reportCount}
            />

            <div className="border-ink/10 border-l-teal border border-l-[3px] bg-white px-[22px] py-5">
              <div className="text-teal-ink mb-2 font-mono text-[10px] tracking-[.12em]">
                AI KONTROL KAPSAMI
              </div>
              <div className="text-ink/[.72] text-[13.5px] leading-[1.75]">
                Dil ve şablon uyumu · Başlık-içerik tutarlılığı · Kategori uygunluğu · Benzerlik
                analizi (yalnızca metin) · Kriter bazlı taslak geri bildirim · Yarışmacı geri
                bildirimi
              </div>
            </div>

            <div className="border-ink/[.12] bg-ink/[.03] border px-[22px] py-4">
              <div className="text-ink/50 mb-1.5 font-mono text-[10px] tracking-[.12em]">
                SON BAŞVURU
              </div>
              <div className="font-mono text-[13px]">
                {competition.submission_deadline
                  ? new Date(competition.submission_deadline).toLocaleString('tr-TR', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                    })
                  : 'Belirlenmedi'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
