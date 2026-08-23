'use client';

import { useState, useTransition } from 'react';
import { saveSimilarityThreshold } from './actions';

export function ThresholdCard({
  competitionId,
  initial,
  overThresholdPct,
  reportCount,
}: {
  competitionId: string;
  initial: number;
  overThresholdPct: number;
  reportCount: number;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const level = value >= 70 ? 'GEVŞEK EŞİK' : value <= 40 ? 'SIKI EŞİK' : 'DENGELİ';
  const tone = value >= 70 ? 'text-danger' : value <= 40 ? 'text-teal' : 'text-success';
  const dirty = value !== initial;

  return (
    <div className="border-ink/10 border bg-white p-[26px]">
      <div className="text-ink/60 mb-1.5 font-mono text-[10.5px] tracking-[.12em]">
        BENZERLİK EŞİĞİ
      </div>
      <div className="text-ink/60 mb-5 text-[13px] leading-[1.55]">
        Bu yüzdenin üzerindeki raporlar hakeme &quot;dikkat çekici&quot; olarak işaretlenir.
        Değiştirmek yeniden analiz tetiklemez.
      </div>

      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-ink font-mono text-[38px] leading-none">%{value}</span>
        <span className={`font-mono text-[11px] tracking-[.1em] ${tone}`}>{level}</span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label="Benzerlik eşiği"
        className="h-1 w-full cursor-pointer"
      />
      <div className="text-ink/[.45] mt-2.5 flex justify-between font-mono text-[10.5px]">
        <span>%0</span><span>%25</span><span>%50</span><span>%75</span><span>%100</span>
      </div>

      <div className="border-ink/[.08] text-ink/60 mt-[18px] border-t pt-[14px] text-[12.5px] leading-[1.55]">
        {reportCount > 0 ? (
          <>
            Yüklü <span className="text-ink font-mono">{reportCount}</span> raporun{' '}
            <span className="text-ink font-mono">%{overThresholdPct}</span>&apos;u mevcut eşiğin
            üzerinde.
          </>
        ) : (
          'Henüz rapor yüklenmedi — eşik etkisi ölçülemiyor.'
        )}
      </div>

      {dirty && (
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await saveSimilarityThreshold(competitionId, value);
              setMsg(r.ok ? 'Kaydedildi.' : (r.error ?? 'Hata'));
            })
          }
          className="bg-ink mt-4 w-full cursor-pointer border-none py-2.5 font-sans text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Kaydediliyor…' : `Eşiği %${value} olarak kaydet`}
        </button>
      )}
      {msg && <div className="text-success mt-2 font-mono text-[11px]">{msg}</div>}
    </div>
  );
}
