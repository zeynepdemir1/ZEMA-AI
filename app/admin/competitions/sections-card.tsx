'use client';

import { useState, useTransition } from 'react';
import { updateRequiredSections } from './actions';

const SECTION = 'font-mono text-[11px] tracking-[.1em] text-ink/75';
const MUTED = 'text-[13px] leading-[1.6] text-ink/75';

type Format = {
  font?: string;
  page?: string;
  alignment?: string;
  max_pages?: number;
  footer?: string;
};

/**
 * Zorunlu bölüm başlıkları — DOĞRUDAN DÜZENLENEBİLİR.
 *
 * AI çıkarımı bir hakem/yönetici gözünden yanlış görülürse (yanlış bölüm
 * adı, eksik/fazla bölüm) burada elle düzeltilir — tekrar PDF yüklemeye
 * gerek kalmaz. Biçim kuralları (yazı tipi, sayfa vb.) altta salt okunur
 * gösteriliyor; onlar bu turda düzenlenebilir değil.
 */
export function SectionsCard({
  stageId,
  initialSections,
  format,
  citationFormat,
}: {
  /** Aşamaya bağlı (0010) — her teslimin kendi zorunlu bölümleri var. */
  stageId: string;
  initialSections: string[];
  format: Format;
  citationFormat: string;
}) {
  const [sections, setSections] = useState(initialSections);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = JSON.stringify(sections) !== JSON.stringify(initialSections);

  function updateAt(i: number, value: string) {
    setSections((s) => s.map((x, idx) => (idx === i ? value : x)));
  }
  function removeAt(i: number) {
    setSections((s) => s.filter((_, idx) => idx !== i));
  }
  function addSection() {
    const v = draft.trim();
    if (!v) return;
    setSections((s) => [...s, v]);
    setDraft('');
  }

  function onSave() {
    setError(null);
    setMsg(null);
    startTransition(async () => {
      const r = await updateRequiredSections(stageId, sections);
      if (r.ok) setMsg('Kaydedildi.');
      else setError(r.error ?? 'Kaydedilemedi.');
    });
  }

  return (
    <div className="border-ink/10 border bg-white p-[26px]">
      <div className="mb-2.5 flex items-center justify-between">
        <span className={SECTION}>ZORUNLU BÖLÜM BAŞLIKLARI</span>
        <span className="text-ink/75 font-mono text-[11px]">{sections.length} BÖLÜM</span>
      </div>

      {sections.length === 0 ? (
        <div className={`${MUTED} mb-3`}>
          Henüz bölüm tanımlanmadı — aşağıdan ekleyin ya da bir şablon PDF&apos;i yükleyin.
        </div>
      ) : (
        <div className="mb-2 flex flex-col gap-1.5">
          {sections.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-ink/75 w-5 shrink-0 font-mono text-[11px]">{i + 1}.</span>
              <input
                value={s}
                onChange={(e) => updateAt(i, e.target.value)}
                className="border-ink/[.18] text-ink w-full border bg-white px-3 py-2 font-sans text-[13.5px]"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                title="Kaldır"
                className="border-ink/[.22] text-ink/75 hover:border-danger hover:text-danger shrink-0 cursor-pointer border bg-white px-2.5 py-2 font-mono text-[11px]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addSection();
            }
          }}
          placeholder="Yeni bölüm başlığı ekle…"
          className="border-ink/[.18] border-dashed text-ink w-full border bg-white px-3 py-2 font-sans text-[13.5px]"
        />
        <button
          type="button"
          onClick={addSection}
          disabled={!draft.trim()}
          className="border-ink/[.22] text-ink/75 shrink-0 cursor-pointer border bg-white px-2.5 py-2 font-mono text-[11px] disabled:opacity-40"
        >
          + EKLE
        </button>
      </div>

      {error && <div className="text-danger mt-3 text-[12.5px]">{error}</div>}

      {dirty && (
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="bg-t3-blue mt-4 w-full cursor-pointer border-none py-2.5 font-sans text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
        </button>
      )}
      {msg && <div className="text-success mt-2 font-mono text-[11px]">{msg}</div>}

      {(format.font || format.page || format.alignment || format.max_pages || format.footer || citationFormat) && (
        <div className="border-ink/[.1] mt-5 border-t pt-4">
          <div className={`${SECTION} mb-2`}>BİÇİM KURALLARI</div>
          <div className="text-ink/75 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px]">
            {format.font && <span>{format.font}</span>}
            {format.page && <span>{format.page}</span>}
            {format.alignment && <span>{format.alignment}</span>}
            {!!format.max_pages && <span>MAKS. {format.max_pages} SAYFA</span>}
            {citationFormat && <span>ATIF {citationFormat}</span>}
          </div>
          {format.footer && (
            <div className="text-ink/75 mt-1.5 font-mono text-[10.5px]">ALTBİLGİ: {format.footer}</div>
          )}
        </div>
      )}
    </div>
  );
}
