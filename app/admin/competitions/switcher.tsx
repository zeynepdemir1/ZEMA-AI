'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createCompetition } from './actions';

const LANGUAGES = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'İngilizce' },
];

/**
 * Yarışma seçici + "yeni yarışma oluştur".
 *
 * "Yarışma Bilgileri" formu (info-card.tsx) var olan TEK yarışmayı yerinde
 * düzenliyordu — yeni ad/yıl yazmak yeni bir yarışma oluşturmuyor, demo
 * yarışmasının kimliğini değiştiriyordu. Bu component gerçekten yeni bir
 * satır açan tek yer; seçim `?comp=<id>` query param'ıyla iki admin
 * sekmesi arasında da korunuyor (bkz. tabs.tsx).
 */
export function CompetitionSwitcher({
  competitions,
  activeId,
}: {
  competitions: Array<{ id: string; name: string; year: number }>;
  activeId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [language, setLanguage] = useState('tr');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function switchTo(id: string) {
    router.push(`${pathname}?comp=${id}`);
  }

  function onCreate() {
    setError(null);
    startTransition(async () => {
      const r = await createCompetition({ name, year, language });
      if (!r.ok) return setError(r.error ?? 'Oluşturulamadı.');
      setAdding(false);
      setName('');
      router.push(`/admin/competitions?comp=${r.id}`);
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <label className="text-ink/75 font-mono text-[10.5px] tracking-[.1em]" htmlFor="comp-switch">
        YARIŞMA
      </label>
      <select
        id="comp-switch"
        value={activeId}
        onChange={(e) => switchTo(e.target.value)}
        className="border-ink/[.18] text-ink border bg-white px-3 py-1.5 font-sans text-[13.5px]"
      >
        {competitions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.year})
          </option>
        ))}
      </select>

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="border-ink/[.22] text-ink/75 cursor-pointer border bg-white px-3 py-1.5 font-mono text-[11px]"
        >
          + YENİ YARIŞMA
        </button>
      )}

      {adding && (
        <div className="border-ink/[.22] flex flex-wrap items-center gap-2 border border-dashed bg-white px-3 py-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Yarışma adı"
            className="border-ink/[.18] text-ink border bg-white px-2.5 py-1.5 font-sans text-[13px]"
          />
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border-ink/[.18] text-ink w-[80px] border bg-white px-2.5 py-1.5 font-sans text-[13px]"
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="border-ink/[.18] text-ink border bg-white px-2.5 py-1.5 font-sans text-[13px]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={onCreate}
            className="bg-ink cursor-pointer border-none px-3 py-1.5 font-mono text-[11px] text-white disabled:opacity-50"
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
