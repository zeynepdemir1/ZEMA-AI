'use client';

import { useState } from 'react';
import { DEFAULT_SIMILARITY_THRESHOLD } from '@/lib/design/mock-data';

/**
 * Benzerlik eşiği kaydırıcısı.
 * PLAN.md §4.4: bu SADECE bir UI filtresi — kaydırmak yeni bir Claude çağrısı
 * TETİKLEMEZ, zaten hesaplanmış similarity_pairs satırlarını filtreler.
 */
export function ThresholdCard() {
  const [value, setValue] = useState(DEFAULT_SIMILARITY_THRESHOLD);

  const level = value >= 70 ? 'GEVŞEK EŞİK' : value <= 40 ? 'SIKI EŞİK' : 'DENGELİ';
  const levelTone =
    value >= 70 ? 'text-danger' : value <= 40 ? 'text-teal' : 'text-success';

  return (
    <div className="border-ink/10 border bg-white p-[26px]">
      <div className="text-ink/60 mb-1.5 font-mono text-[10.5px] tracking-[.12em]">
        BENZERLİK EŞİĞİ
      </div>
      <div className="text-ink/60 mb-5 text-[13px] leading-[1.55]">
        Bu yüzdenin üzerindeki raporlar hakeme &quot;dikkat çekici&quot; olarak işaretlenir.
      </div>

      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-ink font-mono text-[38px] leading-none">%{value}</span>
        <span className={`font-mono text-[11px] tracking-[.1em] ${levelTone}`}>{level}</span>
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
        <span>%0</span>
        <span>%25</span>
        <span>%50</span>
        <span>%75</span>
        <span>%100</span>
      </div>

      <div className="border-ink/[.08] text-ink/60 mt-[18px] border-t pt-[14px] text-[12.5px] leading-[1.55]">
        Geçen yılki 412 raporun <span className="text-ink font-mono">%9</span>&apos;u bu eşiğin
        üzerinde kalırdı.
      </div>
    </div>
  );
}
