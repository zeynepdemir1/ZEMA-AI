'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createStage } from './actions';

/**
 * Rapor aşaması seçici + "yeni aşama ekle".
 *
 * TEKNOFEST'te bir yarışma sıralı birkaç rapor isteyebilir: Ön Tasarım
 * Raporu → Kritik Tasarım Raporu → Final. Her aşamanın kendi şablonu,
 * şartnamesi, rubriği ve teslim tarihi var (bkz. 0010_report_stages.sql).
 * Seçim `?stage=<id>` query param'ıyla korunuyor — CompetitionSwitcher'ın
 * `?comp=<id>` deseninin aynısı.
 *
 * Tek aşamalı yarışmalarda (varsayılan, yeni açılan HER yarışmada olduğu
 * gibi) bu seçici hâlâ görünür — ama tek seçenekle "+ Yeni Aşama" dışında
 * bir karmaşıklık katmıyor.
 */
export function StageSwitcher({
  competitionId,
  stages,
  activeId,
}: {
  competitionId: string;
  stages: Array<{ id: string; name: string }>;
  activeId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function switchTo(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('stage', id);
    router.push(`${pathname}?${params.toString()}`);
  }

  function onCreate() {
    setError(null);
    startTransition(async () => {
      const r = await createStage(competitionId, name);
      if (!r.ok) return setError(r.error ?? 'Oluşturulamadı.');
      setAdding(false);
      setName('');
      const params = new URLSearchParams(searchParams.toString());
      params.set('stage', r.id!);
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="border-ink/[.12] mb-5 flex flex-wrap items-center gap-2.5 border-b pb-4">
      <label className="text-ink/75 font-mono text-[10.5px] tracking-[.1em]" htmlFor="stage-switch">
        RAPOR AŞAMASI
      </label>
      <select
        id="stage-switch"
        value={activeId}
        onChange={(e) => switchTo(e.target.value)}
        className="border-ink/[.18] text-ink border bg-white px-3 py-1.5 font-sans text-[13.5px]"
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="border-ink/[.22] text-ink/75 cursor-pointer border bg-white px-3 py-1.5 font-mono text-[11px]"
        >
          + YENİ AŞAMA
        </button>
      )}

      {adding && (
        <div className="border-ink/[.22] flex flex-wrap items-center gap-2 border border-dashed bg-white px-3 py-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Aşama adı — örn. Kritik Tasarım Raporu"
            className="border-ink/[.18] text-ink w-[260px] border bg-white px-2.5 py-1.5 font-sans text-[13px]"
          />
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={onCreate}
            className="bg-t3-blue cursor-pointer border-none px-3 py-1.5 font-mono text-[11px] text-white disabled:opacity-50"
          >
            {pending ? '…' : 'OLUŞTUR'}
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="border-ink/[.22] text-ink/75 cursor-pointer border bg-white px-3 py-1.5 font-mono text-[11px]"
          >
            İPTAL
          </button>
          {error && <div className="text-danger w-full text-[12.5px]">{error}</div>}
        </div>
      )}
    </div>
  );
}
