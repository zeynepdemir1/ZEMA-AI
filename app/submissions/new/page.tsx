import Link from 'next/link';
import { loadMySubmissions } from '@/lib/reports/queries';
import { UploadForm } from './upload-form';

import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NewSubmissionPage() {
  await requireRole(['competitor']);
  const data = await loadMySubmissions();

  if (!data) {
    return (
      <div className="flex-1 px-6 pt-11 pb-[72px] lg:px-10">
        <div className="border-ink/[.22] mx-auto max-w-[620px] border border-dashed bg-white p-10 text-center">
          <div className="font-heading mb-2 text-[18px] font-semibold">Takım bulunamadı</div>
          <div className="text-ink/60 text-[13.5px]">
            <span className="font-mono">npm run seed</span> çalıştırılmalı.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-6 pt-11 pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[620px]">
        <Link href="/submissions" className="text-teal mb-[18px] inline-block text-[13px] no-underline">
          ← Raporlarıma dön
        </Link>
        <div className="text-ink/50 mb-2.5 font-mono text-[10.5px] tracking-[.14em]">
          {data.team.name} · {data.competition.name}
        </div>
        <h1 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">Yeni rapor yükle</h1>
        <p className="text-ink/[.62] m-0 mb-7 text-[14px] leading-[1.6]">
          Yükledikten sonra altı AI kontrolü otomatik çalışır. Sonuçlar önce hakeme gider;
          size yalnızca hakemin onayladığı geri bildirim ulaşır.
        </p>
        <UploadForm categories={data.categories} />
      </div>
    </div>
  );
}
