'use client';

import { useState, useTransition } from 'react';
import { saveCompetitionInfo } from './actions';

/** ISO timestamp → <input type="datetime-local"> değeri (yerel saat, saniyesiz). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const LANGUAGES = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'İngilizce' },
];

export function InfoCard({
  competitionId,
  initial,
}: {
  competitionId: string;
  initial: { name: string; year: number; language: string; submissionDeadline: string | null };
}) {
  const [name, setName] = useState(initial.name);
  const [year, setYear] = useState(initial.year);
  const [language, setLanguage] = useState(initial.language);
  const [deadline, setDeadline] = useState(toLocalInput(initial.submissionDeadline));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== initial.name ||
    year !== initial.year ||
    language !== initial.language ||
    deadline !== toLocalInput(initial.submissionDeadline);

  function onSave() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const r = await saveCompetitionInfo(competitionId, {
        name,
        year,
        language,
        submissionDeadline: deadline ? new Date(deadline).toISOString() : null,
      });
      if (r.ok) setMsg('Kaydedildi.');
      else setError(r.error ?? 'Kaydedilemedi.');
    });
  }

  return (
    <div className="border-ink/10 border bg-white p-[26px]">
      <div className="text-ink/75 mb-5 font-mono text-[10.5px] tracking-[.12em]">YARIŞMA BİLGİLERİ</div>

      <label className="text-ink/75 mb-1.5 block font-mono text-[10.5px] tracking-[.1em]" htmlFor="ci-name">
        YARIŞMA ADI
      </label>
      <input
        id="ci-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border-ink/[.18] text-ink mb-4 w-full border bg-white px-[14px] py-2.5 font-sans text-[14.5px]"
      />

      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <label className="text-ink/75 mb-1.5 block font-mono text-[10.5px] tracking-[.1em]" htmlFor="ci-year">
            YIL
          </label>
          <input
            id="ci-year"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border-ink/[.18] text-ink w-full border bg-white px-[14px] py-2.5 font-sans text-[14.5px]"
          />
        </div>
        <div>
          <label className="text-ink/75 mb-1.5 block font-mono text-[10.5px] tracking-[.1em]" htmlFor="ci-lang">
            RAPOR DİLİ
          </label>
          <select
            id="ci-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="border-ink/[.18] text-ink w-full border bg-white px-[14px] py-2.5 font-sans text-[14.5px]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="text-ink/75 mb-1.5 block font-mono text-[10.5px] tracking-[.1em]" htmlFor="ci-deadline">
        SON BAŞVURU TARİHİ
      </label>
      <input
        id="ci-deadline"
        type="datetime-local"
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
        className="border-ink/[.18] text-ink mb-5 w-full border bg-white px-[14px] py-2.5 font-sans text-[14.5px]"
      />

      {error && (
        <div className="border-danger text-danger mb-4 border bg-[rgba(180,72,63,.06)] px-4 py-3 text-[13px]">
          {error}
        </div>
      )}

      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="bg-ink w-full cursor-pointer border-none py-2.5 font-sans text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
        </button>
      )}
      {msg && <div className="text-success mt-2 font-mono text-[11px]">{msg}</div>}
    </div>
  );
}
