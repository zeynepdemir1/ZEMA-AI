'use client';

import { useState } from 'react';
import { GridTexture } from '@/components/zema/brand';

/**
 * "Demo Videosunu İzle" — PLAN.md §6: video hazır olana kadar "yakında"
 * placeholder'ı gösterilir. Tasarımdaki modal birebir korundu.
 */
export function DemoVideoDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-ink border-ink/[.28] inline-flex cursor-pointer items-center gap-2.5 border bg-transparent px-[30px] py-[15px] text-[15px] font-semibold whitespace-nowrap"
      >
        <span className="text-[11px]">▶</span>Demo Videosunu İzle
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="ZEMA ürün demosu"
          className="fixed inset-0 z-100 flex items-start justify-center overflow-auto bg-[rgba(18,32,58,.72)] p-10"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="border-ink/[.14] m-auto w-full max-w-[860px] border bg-white"
          >
            <div className="border-ink/10 flex items-center justify-between border-b px-[22px] py-4">
              <span className="text-ink/[.55] font-mono text-[10.5px] tracking-[.14em]">
                ZEMA · ÜRÜN DEMOSU
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Kapat"
                className="text-ink/50 cursor-pointer border-none bg-transparent text-base leading-none"
              >
                ✕
              </button>
            </div>

            <div className="bg-ink relative flex aspect-video flex-col items-center justify-center gap-[18px] overflow-hidden">
              <GridTexture cell={48} />
              <div className="relative flex h-[74px] w-[74px] items-center justify-center border border-white/[.35] pl-1 text-xl text-white/[.75]">
                ▶
              </div>
              <div className="relative text-center">
                <div className="font-heading mb-1.5 text-[19px] font-semibold text-white">
                  Demo videosu yakında
                </div>
                <div className="font-mono text-[11px] tracking-[.12em] text-white/50">
                  HAKEM İNCELEME AKIŞI · ~2 DK
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-6 px-[22px] py-4">
              <span className="text-ink/60 text-[13px]">
                Video hazır olduğunda bu alanda oynatılacak.
              </span>
              <button
                onClick={() => setOpen(false)}
                className="bg-ink cursor-pointer border-none px-[22px] py-[11px] text-[13.5px] font-semibold text-white"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
