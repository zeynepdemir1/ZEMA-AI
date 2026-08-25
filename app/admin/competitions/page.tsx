import { loadAllCompetitions, loadSetup } from '@/lib/reports/queries';
import { AdminTabs } from './tabs';
import { CompetitionSwitcher } from './switcher';
import { InfoCard } from './info-card';
import { CategoriesCard } from './categories-card';

import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Sekme 1 — Yarışma Bilgileri.
 *
 * Yarışmanın temel bilgileri (ad, yıl, dil, son başvuru tarihi) ve
 * kategoriler (ekle/düzenle/sil — daha önce salt okunurdu, kriter CRUD'ı
 * hâlâ Supabase Studio/seed SQL ile yönetiliyor, bkz. docs/NOTES.md §8
 * madde 6, kategoriler o kesme kararının dışına alındı).
 *
 * Şablon, kriterler ve benzerlik eşiği BURADA yok — onlar
 * /admin/competitions/template'te.
 */
export default async function CompetitionInfoPage({
  searchParams,
}: PageProps<'/admin/competitions'>) {
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

  const { competition, categories } = data;

  return (
    <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[980px]">
        <CompetitionSwitcher competitions={allCompetitions} activeId={competition.id} />
        <AdminTabs active={1} comp={competition.id} />

        <h2 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">{competition.name}</h2>
        <p className="text-ink/75 m-0 mb-7 text-[14.5px]">
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

          <CategoriesCard competitionId={competition.id} categories={categories} />
        </div>
      </div>
    </div>
  );
}
