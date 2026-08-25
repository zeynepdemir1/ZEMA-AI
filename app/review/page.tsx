import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser, requireRole } from '@/lib/supabase/server';
import { loadAssignedReports } from '@/lib/reports/queries';

export const dynamic = 'force-dynamic';

const TONE: Record<string, string> = {
  onaylandı: 'text-gold-ink border-gold',
  inceleniyor: 'text-teal-ink border-teal',
  bekliyor: 'text-ink/75 border-ink/[.45]',
  dikkat: 'text-danger border-danger',
};

export default async function ReviewIndexPage() {
  await requireRole(['judge','evaluation_admin','competition_admin']);
  const user = await currentUser();
  if (!user) redirect('/auth?next=/review');

  const reports = await loadAssignedReports();
  const categories = [...new Set(reports.map((r) => r.category))];

  return (
    <div className="flex-1 px-6 pt-11 pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[860px]">
        <div className="text-ink/75 mb-2 font-mono text-[10.5px] tracking-[.14em]">
          HAKEM · {user.fullName ?? user.email}
        </div>
        <h1 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">Atanan raporlar</h1>
        <p className="text-ink/75 m-0 mb-7 text-[14px]">
          {reports.length} rapor incelemenizi bekliyor.
        </p>

        {reports.length === 0 ? (
          <div className="border-ink/[.22] border border-dashed bg-white p-10 text-center">
            <div className="font-heading mb-2 text-[18px] font-semibold">Atanmış rapor yok</div>
            <div className="text-ink/75 mx-auto max-w-[480px] text-[13.5px] leading-[1.6]">
              Değerlendirme Yöneticisi size rapor atadığında burada görünecek. RLS gereği
              yalnızca atandığınız raporları görebilirsiniz.
            </div>
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat} className="mb-6">
              <div className="text-ink/75 mb-2.5 font-mono text-[10.5px] tracking-[.14em]">
                {cat.toLocaleUpperCase('tr-TR')}
              </div>
              <div className="flex flex-col gap-2">
                {reports
                  .filter((r) => r.category === cat)
                  .map((r) => (
                    <Link
                      key={r.id}
                      href={`/review/${r.id}`}
                      className="border-ink/10 flex flex-wrap items-center gap-3 border bg-white px-5 py-4 no-underline"
                    >
                      <span
                        className={`border px-2 py-[3px] font-mono text-[9.5px] tracking-[.1em] ${TONE[r.status]}`}
                      >
                        {r.status.toLocaleUpperCase('tr-TR')}
                      </span>
                      <span className="text-ink text-[15px] font-semibold">{r.team}</span>
                      <span className="text-ink/75 font-mono text-[10.5px]">{r.code}</span>
                      <span className="text-ink/75 ml-auto font-mono text-[10.5px]">
                        {r.approved}/{r.total || 6} ONAY
                      </span>
                    </Link>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
