import { loadSetup } from '@/lib/reports/queries';
import { AdminTabs } from './tabs';
import { InfoCard } from './info-card';

import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Sekme 1 — Yarışma Bilgileri.
 *
 * Yalnızca yarışmanın temel bilgileri: ad, yıl, dil, son başvuru tarihi
 * ve tanımlı kategoriler (salt okunur — kategori CRUD ekranı bilinçli
 * olarak kapsam dışı bırakıldı, bkz. docs/NOTES.md §8 madde 6).
 *
 * Şablon, kriterler ve benzerlik eşiği BURADA yok — onlar
 * /admin/competitions/template'te.
 */
export default async function CompetitionInfoPage() {
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

  const { competition, categories } = data;

  return (
    <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[980px]">
        <AdminTabs active={1} />

        <h2 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">{competition.name}</h2>
        <p className="text-ink/[.62] m-0 mb-7 text-[14.5px]">
          Yarışmanın temel bilgileri. Şablon, kriterler ve benzerlik eşiği için{' '}
          <span className="font-medium">Şablon ve kriterler</span> sekmesine geçin.
        </p>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_.9fr]">
          <InfoCard
            competitionId={competition.id}
            initial={{
              name: competition.name,
              year: competition.year,
              language: competition.language,
              submissionDeadline: competition.submission_deadline,
            }}
          />

          <div className="border-ink/10 border bg-white p-[26px]">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-ink/75 font-mono text-[10.5px] tracking-[.12em]">KATEGORİLER</span>
              <span className="text-ink/[.45] font-mono text-[11px]">{categories.length} ADET</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {categories.length === 0 ? (
                <div className="text-ink/75 text-[13px]">Tanımlı kategori yok.</div>
              ) : (
                categories.map((c) => (
                  <div key={c.id} className="border-ink/[.12] border px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13.5px] font-medium">{c.name}</span>
                      <span className="text-ink/[.45] font-mono text-[10.5px]">{c.reportCount} RAPOR</span>
                    </div>
                    <div className="text-ink/[.55] mt-1 text-[12px] leading-[1.5]">
                      {c.description.slice(0, 140)}
                      {c.description.length > 140 ? '…' : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="text-ink/[.5] mt-4 text-[12px] leading-[1.5]">
              Kategori ekleme/düzenleme bu ekranda yok — Supabase Studio üzerinden{' '}
              <span className="font-mono">categories</span> tablosundan yönetiliyor.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
