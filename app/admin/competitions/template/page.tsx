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
 * Kutu sırası (yukarıdan aşağı, tek sütun):
 *   1. Şablon yükleme (TemplateCard) — yalnızca yükle + başarı/hata göstergesi.
 *   2. Zorunlu bölüm başlıkları — DÜZENLENEBİLİR (SectionsCard), altında
 *      salt okunur biçim kuralları.
 *   3. Şablon PDF'inden çıkarıldı — model/tarih/alıntı doğrulama künyesi.
 *   4. İçerik kuralları.
 *   5. Değerlendirme kriterleri.
 *   6. Benzerlik eşiği (ThresholdCard) — değişmedi.
 *
 * Önceki sürümde zorunlu bölümler hem TemplateCard'ın yükleme sonucunda
 * hem bu sayfanın kalıcı özetinde İKİ KERE gösteriliyordu. TemplateCard
 * artık yalnızca "yüklendi/hata" diyor, kalıcı veriyi burası tek yerden
 * gösteriyor.
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

  const { competition, criteria, overThresholdPct } = data;
  const spec = competition.template_spec;
  const wasProcessed = Boolean(spec.source);
  const reportCount = data.categories.reduce((a, c) => a + c.reportCount, 0);

  return (
    <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[720px]">
        <CompetitionSwitcher competitions={allCompetitions} activeId={competition.id} />
        <AdminTabs active={2} comp={competition.id} />

        <h2 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">Şablon ve kriterler</h2>
        <p className="text-ink/[.62] m-0 mb-7 text-[14.5px]">
          AI&apos;nin analiz sırasında kullandığı referans burası — bu sayfadaki değerler doğrudan
          prompt&apos;a giriyor.
        </p>

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

          {/* 3. Şablon PDF'inden çıkarıldı */}
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

          {/* 4. İçerik kuralları */}
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

          {/* 5. Değerlendirme kriterleri */}
          <div className="border-ink/10 border bg-white p-[26px]">
            <div className="mb-2.5 flex items-center justify-between">
              <span className={SECTION}>DEĞERLENDİRME KRİTERLERİ</span>
              {criteria.length > 0 && (
                <span className="text-ink/[.45] font-mono text-[11px]">
                  {`${criteria.length} KRİTER · TOPLAM %${criteria.reduce((a, c) => a + c.weightPct, 0)}`}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {criteria.length === 0 ? (
                <div className="text-ink/75 text-[13px]">
                  {wasProcessed
                    ? 'Bu şablonda bir değerlendirme rubriği bulunamadı — şablon PDF\'inde puanlama kriterleri yer almıyor.'
                    : 'Henüz şablon işlenmedi — yukarıdan bir şablon PDF\'i yükleyip çözümleyin.'}
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

          {/* 6. Benzerlik eşiği — değişmedi */}
          <ThresholdCard
            competitionId={competition.id}
            initial={competition.similarity_threshold}
            overThresholdPct={overThresholdPct}
            reportCount={reportCount}
          />
        </div>
      </div>
    </div>
  );
}
