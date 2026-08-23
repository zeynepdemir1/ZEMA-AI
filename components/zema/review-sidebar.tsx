'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CATEGORY_NAMES,
  COMPETITION_NAME,
  CURRENT_JUDGE,
  REPORTS,
  type ReportStatusKey,
} from '@/lib/design/mock-data';

/** Durum → renk. Tasarımdaki badgeColor eşlemesi. */
const STATUS_TONE: Record<ReportStatusKey, string> = {
  onaylandı: 'text-gold border-gold',
  inceleniyor: 'text-teal border-teal',
  bekliyor: 'text-ink/[.45] border-ink/[.45]',
  dikkat: 'text-danger border-danger',
};

const STATUS_DOT: Record<ReportStatusKey, string> = {
  onaylandı: 'bg-gold',
  inceleniyor: 'bg-teal',
  bekliyor: 'bg-ink/[.45]',
  dikkat: 'bg-danger',
};

export function ReviewSidebar({ activeCode }: { activeCode: string }) {
  const [compOpen, setCompOpen] = useState(true);
  const [catOpen, setCatOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(CATEGORY_NAMES.map((c) => [c, true])),
  );

  return (
    <div className="border-ink/10 flex flex-col border-r bg-white">
      <div className="border-ink/10 border-b px-5 pt-[18px] pb-[14px]">
        <div className="text-ink/50 font-mono text-[10px] tracking-[.14em]">ATANMIŞ RAPORLAR</div>
      </div>

      <div className="flex-1 overflow-auto px-2 pt-2 pb-4">
        <button
          onClick={() => setCompOpen((v) => !v)}
          className="text-ink flex w-full cursor-pointer items-center gap-[9px] border-none bg-transparent p-2.5 text-left font-sans"
        >
          <span className="text-ink/50 w-2.5 text-[10px]">{compOpen ? '▾' : '▸'}</span>
          <span className="flex-1 font-mono text-[10.5px] leading-[1.4] tracking-[.1em]">
            {COMPETITION_NAME}
          </span>
        </button>

        {compOpen && (
          <div className="flex flex-col gap-0.5 pl-1.5">
            {CATEGORY_NAMES.map((name) => {
              const open = catOpen[name] !== false;
              const items = REPORTS.filter((r) => r.category === name);
              return (
                <div key={name}>
                  <button
                    onClick={() => setCatOpen((s) => ({ ...s, [name]: !open }))}
                    className="text-ink flex w-full cursor-pointer items-center gap-[9px] border-none bg-transparent px-2.5 py-[9px] text-left font-sans"
                  >
                    <span className="text-ink/50 w-2.5 text-[10px]">{open ? '▾' : '▸'}</span>
                    <span className="flex-1 text-[13px] font-semibold">{name}</span>
                    <span className="text-ink/[.42] font-mono text-[9.5px]">
                      {items.length} RAPOR
                    </span>
                  </button>

                  {open && (
                    <div className="flex flex-col gap-[3px] pt-0.5 pr-0 pb-2 pl-[19px]">
                      {items.map((r) => {
                        const active = r.code === activeCode;
                        return (
                          <Link
                            key={r.code}
                            href={`/review/${r.code}`}
                            className={`block border-l-[3px] p-3 no-underline ${
                              active
                                ? 'border-l-ink bg-ink/[.05]'
                                : 'border-l-transparent bg-transparent'
                            }`}
                          >
                            <div className="mb-1.5 flex items-center gap-2">
                              <span
                                className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[r.status]}`}
                              />
                              <span
                                className={`border px-1.5 py-0.5 font-mono text-[9px] tracking-[.1em] ${STATUS_TONE[r.status]}`}
                              >
                                {r.status.toLocaleUpperCase('tr-TR')}
                              </span>
                            </div>
                            <div className="text-ink text-[13.5px] leading-[1.3] font-semibold tracking-[.01em]">
                              {r.team}
                            </div>
                            <div className="text-ink/[.38] mt-1 font-mono text-[9.5px]">
                              ZEMA KAYIT NO {r.code}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
