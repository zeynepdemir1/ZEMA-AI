'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCriterion, saveCriterion } from './actions';

const SECTION = 'font-mono text-[11px] tracking-[.1em] text-ink/75';
const BODY = 'text-[14px] leading-[1.7] text-ink/85';
const MUTED = 'text-[13px] leading-[1.6] text-ink/75';
const INPUT =
  'border-ink/[.18] text-ink w-full border bg-white px-[12px] py-2.5 font-sans text-[14px] disabled:opacity-60';

export type CriterionRow = {
  id: string;
  code: string;
  title: string;
  description: string;
  maxScore: number;
  weightPct: number;
};

const EMPTY = { code: '', title: '', description: '', maxScore: 10, weightPct: 20 };

/**
 * Değerlendirme kriterlerinin ELLE girildiği ekran.
 *
 * Kriterler şimdiye kadar yalnızca şablon PDF'inden çıkarılabiliyordu. Ama
 * puanlama rubriği çoğu TEKNOFEST yarışmasında şablonun İÇİNDE değil, ayrı
 * bir belgede olur — gerçek bir şablonla denendiğinde `template_spec.criteria`
 * boş dizi döndü ve yarışma 0 kriterle kaldı. O durumda criteria_scoring
 * kontrolü değerlendirecek hiçbir şey bulamıyor.
 */
export function CriteriaCard({
  competitionId,
  stageId,
  criteria,
}: {
  competitionId: string;
  /** Kriterler aşamaya bağlı (0010) — her teslimin kendi rubriği var. */
  stageId: string;
  criteria: CriterionRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const totalWeight = criteria.reduce((a, c) => a + c.weightPct, 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'İşlem başarısız.');
      else {
        setEditing(null);
        setAdding(false);
        setForm(EMPTY);
        router.refresh();
      }
    });
  }

  function openAdd() {
    setAdding(true);
    setEditing(null);
    setForm({ ...EMPTY, code: `K-${String(criteria.length + 1).padStart(2, '0')}` });
  }

  function openEdit(c: CriterionRow) {
    setEditing(c.id);
    setAdding(false);
    setForm({
      code: c.code,
      title: c.title,
      description: c.description,
      maxScore: c.maxScore,
      weightPct: c.weightPct,
    });
  }

  const editor = (
    <div className="border-ink/[.18] mt-3 border bg-white p-4">
      <div className="mb-3 flex gap-2">
        <input
          value={form.code}
          disabled={pending}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          placeholder="K-01"
          className={`${INPUT} max-w-[92px] font-mono`}
        />
        <input
          value={form.title}
          disabled={pending}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Kriter adı — örn. Problem Tanımı"
          className={INPUT}
        />
      </div>
      <textarea
        value={form.description}
        disabled={pending}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        rows={3}
        placeholder="Beklenti: bu kriterin karşılanmış sayılması için raporda ne bulunmalı?"
        className={`${INPUT} mb-1 resize-y`}
      />
      <div className={`${MUTED} mb-3`}>
        Bu metin doğrudan AI&apos;ye gidiyor — ne kadar somutsa değerlendirme o kadar
        tutarlı olur.
      </div>
      <div className="mb-3 flex flex-wrap gap-4">
        <label className={`${MUTED} flex items-center gap-2`}>
          En yüksek puan
          <input
            type="number"
            min={1}
            value={form.maxScore}
            disabled={pending}
            onChange={(e) => setForm({ ...form, maxScore: Number(e.target.value) })}
            className={`${INPUT} w-[80px] font-mono`}
          />
        </label>
        <label className={`${MUTED} flex items-center gap-2`}>
          Ağırlık %
          <input
            type="number"
            min={1}
            max={100}
            value={form.weightPct}
            disabled={pending}
            onChange={(e) => setForm({ ...form, weightPct: Number(e.target.value) })}
            className={`${INPUT} w-[80px] font-mono`}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              saveCriterion({
                competitionId,
                stageId,
                criterionId: editing ?? undefined,
                ...form,
              }),
            )
          }
          className="bg-t3-blue cursor-pointer border-none px-4 py-2 font-mono text-[11px] tracking-[.1em] text-white disabled:opacity-50"
        >
          {pending ? 'KAYDEDİLİYOR…' : 'KAYDET'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setAdding(false);
            setEditing(null);
            setError(null);
          }}
          className="border-ink/[.22] text-ink/85 cursor-pointer border px-4 py-2 font-mono text-[11px] tracking-[.1em] disabled:opacity-50"
        >
          VAZGEÇ
        </button>
      </div>
    </div>
  );

  return (
    <div id="kriterler" className="border-ink/10 scroll-mt-6 border bg-white px-[22px] py-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <span className={SECTION}>DEĞERLENDİRME KRİTERLERİ</span>
        <span className="text-ink/75 font-mono text-[11px]">
          {criteria.length} KRİTER · TOPLAM %{totalWeight}
        </span>
      </div>

      {criteria.length === 0 ? (
        // Boş durum SESSİZ olmamalı: şablonda rubrik bulunamadığında yarışma
        // 0 kriterle kalıyor ve criteria_scoring değerlendirecek bir şey
        // bulamıyor. Sebep ve çözüm burada açıkça yazıyor.
        <div className="border-gold-ink/40 mb-3 border-l-2 pl-3">
          <div className={`${BODY} mb-1`}>
            Bu yarışma için henüz puanlama kriteri tanımlanmamış.
          </div>
          <div className={MUTED}>
            Şablon PDF&apos;inde puanlama rubriği bulunamadı — bu beklenen bir durumdur,
            rubrik çoğu yarışmada şablondan ayrı bir belgede olur. Kriterleri elle
            girmeniz gerekiyor; aksi halde hakem ekranındaki kriter bazlı
            değerlendirme çalışmaz.
          </div>
        </div>
      ) : (
        <div className="mb-3 flex flex-col gap-1.5">
          {criteria.map((c) => (
            <div key={c.id} className="border-ink/[.12] border px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-ink/75 font-mono text-[11px]">{c.code || '—'}</span>
                <span className="text-[14px] font-medium">{c.title}</span>
                <span className="text-ink/75 ml-auto font-mono text-[11px]">
                  %{c.weightPct} · maks {c.maxScore}
                </span>
              </div>
              <div className={`${MUTED} mt-1`}>{c.description}</div>
              {editing === c.id ? (
                editor
              ) : (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => openEdit(c)}
                    className="border-ink/[.22] text-ink/85 cursor-pointer border px-3 py-1.5 font-mono text-[10.5px] tracking-[.1em] disabled:opacity-50"
                  >
                    DÜZENLE
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (
                        confirm(
                          `"${c.title}" silinecek. Bu kritere bağlı AI değerlendirmeleri ve hakem metinleri de silinir. Devam edilsin mi?`,
                        )
                      ) {
                        run(() => deleteCriterion(c.id));
                      }
                    }}
                    className="border-danger text-danger cursor-pointer border px-3 py-1.5 font-mono text-[10.5px] tracking-[.1em] disabled:opacity-50"
                  >
                    SİL
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalWeight !== 100 && criteria.length > 0 && (
        <div className={`${MUTED} mb-3`}>
          Ağırlıklar toplamı %{totalWeight} — %100 olması beklenir. Bu bir hata değil,
          ama ağırlıklı puan hesabı buna göre ölçeklenir.
        </div>
      )}

      {adding ? (
        editor
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={openAdd}
          className="bg-t3-blue cursor-pointer border-none px-4 py-2.5 font-mono text-[11px] tracking-[.1em] text-white disabled:opacity-50"
        >
          + KRİTER EKLE
        </button>
      )}

      {error && (
        <div className="border-danger text-danger mt-3 border bg-[rgba(203,36,26,.06)] px-4 py-3 text-[13.5px] leading-[1.6]">
          {error}
        </div>
      )}
    </div>
  );
}
