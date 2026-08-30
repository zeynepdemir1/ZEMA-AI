'use client';

import { useState } from 'react';

/** YouTube video ID — https://youtu.be/PnqQAStG5T4 */
const DEMO_VIDEO_ID = 'PnqQAStG5T4';

/**
 * "Demo Videosunu İzle" — YouTube'daki ürün demosunu modal içinde oynatır.
 * Iframe yalnızca modal açıkken mount edilir (gereksiz YouTube script'i
 * ana sayfa yüklenirken çekilmesin).
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
              <span className="text-ink/75 font-mono text-[10.5px] tracking-[.14em]">
                ZEMA · ÜRÜN DEMOSU
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Kapat"
                className="text-ink/75 cursor-pointer border-none bg-transparent text-base leading-none"
              >
                ✕
              </button>
            </div>

            <div className="bg-ink relative aspect-video overflow-hidden">
              <iframe
                src={`https://www.youtube.com/embed/${DEMO_VIDEO_ID}?autoplay=1`}
                title="ZEMA ürün demosu"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-6 px-[22px] py-4">
              <span className="text-ink/75 text-[13px]">HAKEM İNCELEME AKIŞI · ~2 DK</span>
              <button
                onClick={() => setOpen(false)}
                className="bg-t3-blue cursor-pointer border-none px-[22px] py-[11px] text-[13.5px] font-semibold text-white"
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
