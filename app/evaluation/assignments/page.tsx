import Link from 'next/link';
import { loadAssignments } from '@/lib/reports/queries';
import { requireRole } from '@/lib/supabase/server';
import { AssignmentTable } from './assignment-table';

export const dynamic = 'force-dynamic';

export default async function AssignmentsPage() {
  // §3.1: assignments CRUD yalnızca Değerlendirme Yöneticisinde.
  await requireRole(['evaluation_admin']);
  const data = await loadAssignments();

  if (!data) {
    return (
      <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
        <div className="border-ink/[.22] mx-auto max-w-[680px] border border-dashed bg-white p-10 text-center">
          <div className="font-heading mb-2 text-[18px] font-semibold">Tanımlı yarışma yok</div>
          <div className="text-ink/60 text-[13.5px]">
            <span className="font-mono">npm run seed</span> çalıştırılmalı.
          </div>
        </div>
      </div>
    );
  }

  const assigned = data.rows.filter((r) => r.judgeId).length;

  return (
    <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[1080px]">
        <Link href="/evaluation" className="text-teal mb-[18px] inline-block text-[13px] no-underline">
          ← Değerlendirme panosuna dön
        </Link>

        <div className="mb-6">
          <div className="text-ink/50 mb-2 font-mono text-[10.5px] tracking-[.14em]">
            HAKEM ATAMASI · {data.competition.name}
          </div>
          <h1 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">Atamalar</h1>
          <p className="text-ink/[.62] m-0 text-[14px] leading-[1.6]">
            {assigned}/{data.rows.length} rapor atandı. Hakem yalnızca kendisine atanan raporu
            görebilir — atanmamış rapor hiçbir hakemin ekranında çıkmaz.
          </p>
        </div>

        <AssignmentTable rows={data.rows} judges={data.judges} />
      </div>
    </div>
  );
}
