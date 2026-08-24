import { loadAllCompetitions, loadSetup } from '@/lib/reports/queries';
import { AdminTabs } from '../tabs';
import { CompetitionSwitcher } from '../switcher';
import { TemplateCard } from '../template-card';
import { SectionsCard } from '../sections-card';
import { ThresholdCard } from '../threshold-card';
import { notSpecifiedLabel } from '../not-specified-labels';

import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SECTION = 'font-mono text-[11px] tracking-[.1em] text-ink/75';

/**
 * Sekme 2 — Şablon ve Kriterler.
 *
 * İki dikey sütun (sayfa dar tek sütunda boşa alan harcıyordu):
 *   SOL  — 1. Şablon yükleme  2. Zorunlu bölüm başlıkları (düzenlenebilir)
 *   SAĞ  — Şablon PDF'inden çıkarıldı · İçerik kuralları · Benzerlik eşiği
 *
 * "Değerlendirme kriterleri" kutusu KASITLI OLARAK burada YOK — salt okunur
 * bir liste olarak işlevsizdi (kullanıcı geri bildirimi). `criteria`
 * tablosu ve şablon çıkarımının onu doldurması hâlâ çalışıyor (bkz.
 * app/api/competitions/[id]/template/route.ts) — criteria_scoring kontrolü
 * hâlâ bu tabloyu okuyor, yalnızca bu sayfada AYRI bir görüntüleme kutusu
 * yok.
 */
export default async function TemplateSetupPage({
  searchParams,
}: PageProps<'/admin/competitions/template'>) {
  await requireRole(['competition_admin']);
  const sp = await searchParams;
  const compParam = typeof sp.comp === 'string' ? sp.comp : undefined;
  const [data, allCompetitions] = await Promise.all([loadSetup(compParam), loadAllCompetitions()]);

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

  const { competition, overThresholdPct } = data;
  const spec = competition.template_spec;
  const wasProcessed = Boolean(spec.source);
  const reportCount = data.categories.reduce((a, c) => a + c.reportCount, 0);

  return (
    <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[1180px]">
        <CompetitionSwitcher competitions={allCompetitions} activeId={competition.id} />
        <AdminTabs active={2} comp={competition.id} />

        <h2 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">Şablon ve kriterler</h2>
        <p className="text-ink/[.62] m-0 mb-7 text-[14.5px]">
          AI&apos;nin analiz sırasında kullandığı referans burası — bu sayfadaki değerler doğrudan
          prompt&apos;a giriyor.
        </p>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.2fr_.9fr]">
        <div className="flex flex-col gap-5">
          {/* 1. Şablon yükleme */}
          <TemplateCard
            competitionId={competition.id}
            hasPrevious={Boolean(spec.previous)}
          />

          {/* 2. Zorunlu bölüm başlıkları — düzenlenebilir.
              key: yeni bir şablon çözümlendiğinde (ya da geri alındığında)
              bileşeni YENİDEN MOUNT ET — yoksa useState ilk yüklemedeki
              bölümlerde takılı kalır, TemplateCard'ın router.refresh()'i
              yeni sunucu verisini prop olarak getirir ama iç state'i
              güncellemez. */}
          <SectionsCard
            key={spec.source?.extracted_at ?? 'none'}
            competitionId={competition.id}
            initialSections={spec.required_sections ?? []}
            format={spec.format ?? {}}
            citationFormat={spec.citation_format ?? ''}
          />
        </div>

        {/* SAĞ SÜTUN — şablon PDF'inden çıkarıldı · içerik kuralları · benzerlik eşiği */}
        <div className="flex flex-col gap-5">
          {wasProcessed && (
            <div className="border-ink/10 border bg-white p-[26px]">
              <div className={`${SECTION} mb-2.5`}>ŞABLON PDF&apos;İNDEN ÇIKARILDI</div>
              <ul className="text-ink/75 m-0 list-none p-0 text-[13px] leading-[1.6]">
                <li>Model: {spec.source?.model ?? '—'}</li>
                {spec.source?.extracted_at && (
                  <li>
                    Tarih:{' '}
                    {new Date(spec.source.extracted_at).toLocaleString('tr-TR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </li>
                )}
                <li>
                  Alıntı doğrulama: {spec.source?.quotes_verified ?? 0}/{spec.source?.quotes_total ?? 0}{' '}
                  alıntı şablonda birebir bulundu
                </li>
              </ul>

              {(spec.not_specified ?? []).length > 0 && (
                <div className="border-gold-ink/40 mt-3 border-l-2 pl-3">
                  <div className="text-ink/75 mb-1.5 font-mono text-[10px] tracking-[.1em]">
                    ŞABLONDA BELİRTİLMEMİŞ
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(spec.not_specified ?? []).map((k) => (
                      <span
                        key={k}
                        className="border-gold-ink/30 text-ink/75 border bg-[rgba(201,138,62,.06)] px-2 py-1 text-[12px]"
                      >
                        {notSpecifiedLabel(k)}
                      </span>
                    ))}
                  </div>
                  <div className="text-ink/[.55] mt-1.5 text-[12px] leading-[1.5]">
                    Bu alanlar şablonda bulunamadığı için boş bırakıldı — model uydurmadı.
                  </div>
                </div>
              )}
            </div>
          )}

          {(spec.content_rules ?? []).length > 0 && (
            <div className="border-ink/10 border bg-white p-[26px]">
              <div className={`${SECTION} mb-2.5`}>İÇERİK KURALLARI</div>
              <ul className="text-ink/[.72] m-0 list-disc pl-4 text-[13px] leading-[1.65]">
                {(spec.content_rules ?? []).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

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
