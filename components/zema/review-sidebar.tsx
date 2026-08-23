'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CURRENT_JUDGE } from '@/lib/design/mock-data';
import type { SidebarReport } from '@/lib/reports/queries';

const TONE: Record<SidebarReport['status'], string> = {
  onaylandı: 'text-gold border-gold',
  inceleniyor: 'text-teal border-teal',
  bekliyor: 'text-ink/[.45] border-ink/[.45]',
  dikkat: 'text-danger border-danger',
};
const DOT: Record<SidebarReport['status'], string> = {
  onaylandı: 'bg-gold',
  inceleniyor: 'bg-teal',
  bekliyor: 'bg-ink/[.45]',
  dikkat: 'bg-danger',
};

export function ReviewSidebar({
  activeId,
  reports,
}: {
  activeId: string;
  reports: SidebarReport[];
}) {
  const categories = [...new Set(reports.map((r) => r.category))];
  const [open, setOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(categories.map((c) => [c, true])),
  );

  return (
    <div className="border-ink/10 flex flex-col border-r bg-white">
      <div className="border-ink/10 border-b px-5 pt-[18px] pb-[14px]">
        <div className="text-ink/50 font-mono text-[10px] tracking-[.14em]">
          RAPORLAR · {reports.length}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-2 pt-2 pb-4">
        {reports.length === 0 && (
          <div className="text-ink/50 px-3 py-4 text-[12.5px]">Henüz rapor yüklenmedi.</div>
        )}
        {categories.map((cat) => {
          const items = reports.filter((r) => r.category === cat);
          const isOpen = open[cat] !== false;
          return (
            <div key={cat}>
              <button
                onClick={() => setOpen((s) => ({ ...s, [cat]: !isOpen }))}
                className="text-ink flex w-full cursor-pointer items-center gap-[9px] border-none bg-transparent px-2.5 py-[9px] text-left font-sans"
              >
                <span className="text-ink/50 w-2.5 text-[10px]">{isOpen ? '▾' : '▸'}</span>
                <span className="flex-1 text-[13px] font-semibold">{cat}</span>
                <span className="text-ink/[.42] font-mono text-[9.5px]">{items.length} RAPOR</span>
              </button>

              {isOpen && (
                <div className="flex flex-col gap-[3px] pt-0.5 pr-0 pb-2 pl-[19px]">
                  {items.map((r) => (
                    <Link
                      key={r.id}
                      href={`/review/${r.id}`}
                      className={`block border-l-[3px] p-3 no-underline ${
                        r.id === activeId
                          ? 'border-l-ink bg-ink/[.05]'
                          : 'border-l-transparent bg-transparent'
                      }`}
                    >
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[r.status]}`} />
                        <span
                          className={`border px-1.5 py-0.5 font-mono text-[9px] tracking-[.1em] ${TONE[r.status]}`}
                        >
                          {r.status.toLocaleUpperCase('tr-TR')}
                        </span>
                      </div>
                      <div className="text-ink text-[13.5px] leading-[1.3] font-semibold">
                        {r.team}
                      </div>
                      <div className="text-ink/[.38] mt-1 font-mono text-[9.5px]">
                        {r.code} · {r.approved}/{r.total || 6} ONAY
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-ink/10 flex items-center gap-2.5 border-t px-5 py-[14px]">
        <div className="bg-ink flex h-7 w-7 items-center justify-center text-[11.5px] font-semibold text-white">
          {CURRENT_JUDGE.initials}
        </div>
        <div>
          <div className="text-[12.5px] font-semibold">{CURRENT_JUDGE.name}</div>
          <div className="text-ink/50 font-mono text-[10px]">{CURRENT_JUDGE.role}</div>
        </div>
      </div>
    </div>
  );
}
