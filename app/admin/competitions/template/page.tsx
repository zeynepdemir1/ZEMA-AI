import { loadSetup } from '@/lib/reports/queries';
import { AdminTabs } from '../tabs';
import { TemplateCard } from '../template-card';
import { ThresholdCard } from '../threshold-card';

import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Sekme 2 — Şablon ve Kriterler.
 *
 * Tek giriş noktası: şablon PDF'i yükle. AI hem zorunlu bölümleri/biçim
 * kurallarını (template_spec) hem de bir puanlama rubriği varsa
 * değerlendirme kriterlerini (`criteria` tablosu) PDF'ten çıkarıp yazıyor.
 * Bu kriterler raporlar analiz edilirken criteria_scoring kontrolünde
 * doğrudan kullanılıyor (lib/ai/prompts.ts buildCompetitionContext).
 *
 * Benzerlik eşiği de burada — o da "raporu nasıl okuyoruz" sorusunun bir
 * parçası, yarışma temel bilgilerinden ayrı.
 */
export default async function TemplateSetupPage() {
  await requireRole(['competition_admin']);
  const data = await loadSetup();

  if (!data) {
    return (
      <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
        <div className="border-ink/[.22] mx-auto max-w-[680px] border border-dashed bg-white p-10 text-center">
          <div className="font-heading mb-2 text-[18px] font-semibold">Tanımlı yarışma yok</div>
          <div className="text-ink/75 text-[13.5px]">
            <span className="font-mono">npm run seed</span> ile örnek yarışma, kategoriler ve rubrik
            oluşturulabilir.
          </div>
        </div>
      </div>
    );
  }

  const { competition, criteria, overThresholdPct } = data;
  const sections = competition.template_spec.required_sections ?? [];
  const reportCount =
    data.categories.reduce((a, c) => a + c.reportCount, 0);

  return (
    <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[980px]">
        <AdminTabs active={2} />

        <h2 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">Şablon ve kriterler</h2>
        <p className="text-ink/[.62] m-0 mb-7 text-[14.5px]">
          AI&apos;nin analiz sırasında kullandığı referans burası — bu sayfadaki değerler doğrudan
          prompt&apos;a giriyor.
        </p>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="border-ink/10 border bg-white p-[26px]">
            <div className="text-ink/75 mb-[7px] font-mono text-[10.5px] tracking-[.12em]">
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
                      className="border-ink/[.18] text-ink/75 border bg-white px-2 py-1 font-mono text-[10.5px]"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-ink/75 text-[12.5px]">Şablon tanımlanmamış.</div>
              )}
              <div className="text-ink/[.45] mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px]">
                <span>{competition.template_spec.format?.font ?? '—'}</span>
                <span>{competition.template_spec.format?.page ?? '—'}</span>
                <span>{competition.template_spec.format?.alignment ?? '—'}</span>
                <span>MAKS. {competition.template_spec.format?.max_pages ?? '—'} SAYFA</span>
                <span>ATIF {competition.template_spec.citation_format ?? '—'}</span>
              </div>
              {competition.template_spec.format?.footer && (
                <div className="text-ink/75 mt-1 font-mono text-[10.5px]">
                  ALTBİLGİ: {competition.template_spec.format.footer}
                </div>
              )}
            </div>

            {/* Şablon PDF'ten çıkarıldıysa künyesi: hangi model, kaç alıntı
                doğrulandı. Elle girilen spec'te bu blok hiç görünmüyor. */}
            {competition.template_spec.source && (
              <div className="border-ink/[.12] mb-5 border-l-2 pl-3">
                <div className="text-ink/75 mb-1.5 font-mono text-[11px] tracking-[.1em]">
                  ŞABLON PDF&apos;İNDEN ÇIKARILDI
                </div>
                <ul className="text-ink/75 m-0 list-none p-0 text-[13px] leading-[1.6]">
                  <li>Model: {competition.template_spec.source.model ?? '—'}</li>
                  {competition.template_spec.source.extracted_at && (
                    <li>
                      Tarih:{' '}
                      {new Date(competition.template_spec.source.extracted_at).toLocaleString(
                        'tr-TR',
                        { dateStyle: 'medium', timeStyle: 'short' },
                      )}
                    </li>
                  )}
                  <li>
                    Alıntı doğrulama: {competition.template_spec.source.quotes_verified ?? 0}/
                    {competition.template_spec.source.quotes_total ?? 0} alıntı şablonda birebir
                    bulundu
                  </li>
                  {(competition.template_spec.not_specified ?? []).length > 0 && (
                    <li>
                      Şablonda belirtilmemiş:{' '}
                      {(competition.template_spec.not_specified ?? []).join(' · ')}
                    </li>
                  )}
                </ul>
              </div>
            )}

            {(competition.template_spec.content_rules ?? []).length > 0 && (
              <div className="border-ink/[.12] mb-5 border-l-2 pl-3">
                <div className="text-ink/75 mb-1.5 font-mono text-[10px] tracking-[.12em]">
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
              <span className="text-ink/75 font-mono text-[10.5px] tracking-[.12em]">
                DEĞERLENDİRME KRİTERLERİ
              </span>
              <span className="text-ink/[.45] font-mono text-[11px]">
                {`${criteria.length} KRİTER · TOPLAM %${criteria.reduce((a, c) => a + c.weightPct, 0)}`}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {criteria.length === 0 ? (
                <div className="text-ink/75 text-[13px]">
                  Henüz kriter yok — aşağıdan bir şablon yükleyip çözümleyin.
                </div>
              ) : (
                criteria.map((k) => (
                  <div key={k.id} className="border-ink/[.12] border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ink/[.45] font-mono text-[10.5px]">{k.code}</span>
                      <span className="text-[13.5px]">{k.title}</span>
                      <span className="text-ink/[.45] ml-auto font-mono text-[11px]">
                        %{k.weightPct} · maks {k.maxScore}
                      </span>
                    </div>
                    {k.description && (
                      <div className="text-ink/75 mt-1 text-[12.5px] leading-[1.5]">{k.description}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <TemplateCard
              competitionId={competition.id}
              hasPrevious={Boolean(competition.template_spec.previous)}
            />

            <ThresholdCard
              competitionId={competition.id}
              initial={competition.similarity_threshold}
              overThresholdPct={overThresholdPct}
              reportCount={reportCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
