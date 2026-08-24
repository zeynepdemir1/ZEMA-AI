'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { AssignmentRow, JudgeLoad } from '@/lib/reports/queries';
import { assignReport, distributeBalanced, unassignReport } from './actions';

export function AssignmentTable({
  rows,
  judges,
}: {
  rows: AssignmentRow[];
  judges: JudgeLoad[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const unassignedCount = rows.filter((r) => !r.judgeId).length;

  function run(fn: () => Promise<{ ok: boolean; error?: string; changed?: number }>, okText: (n: number) => string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setBusyRow(null);
      setMsg({ ok: r.ok, text: r.ok ? okText(r.changed ?? 0) : (r.error ?? 'Hata') });
    });
  }

  return (
    <>
      {/* Hakem yükü + dengeli dağıt */}
      <div className="border-ink/10 mb-5 border bg-white px-6 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="text-ink/75 font-mono text-[10.5px] tracking-[.14em]">
            HAKEM YÜKÜ · {judges.length} HAKEM
          </div>
          <button
            disabled={pending || unassignedCount === 0 || judges.length === 0}
            onClick={() =>
              run(distributeBalanced, (n) =>
                n === 0 ? 'Atanmamış rapor yok.' : `${n} rapor dengeli dağıtıldı.`,
              )
            }
            className="bg-ink cursor-pointer border-none px-5 py-2.5 font-sans text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {pending ? 'Dağıtılıyor…' : `Dengeli dağıt (${unassignedCount} atanmamış)`}
          </button>
        </div>

        {judges.length === 0 ? (
          <div className="text-danger text-[13px]">
            Kayıtlı hakem yok. Hakem hesabı kayıt koduyla oluşturulmalı.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {judges.map((j) => (
              <div key={j.id} className="border-ink/[.12] border px-3 py-2.5">
                <div className="truncate text-[13px] font-medium">{j.name}</div>
                <div className="text-ink/[.55] mt-1 font-mono text-[11px]">
                  {j.assigned} rapor
                </div>
                <div className="bg-ink/[.09] mt-2 h-[4px]">
                  <div
                    className="bg-ink h-[4px]"
                    style={{
                      width: `${Math.min(100, (j.assigned / Math.max(1, rows.length)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {msg && (
        <div
          className={`mb-5 border px-4 py-2.5 text-[13px] ${
            msg.ok
              ? 'border-success text-success bg-[rgba(63,125,92,.06)]'
              : 'border-danger text-danger bg-[rgba(180,72,63,.06)]'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Rapor → hakem tablosu */}
      <div className="border-ink/10 border bg-white px-6 pt-5 pb-6">
        <div className="text-ink/75 mb-4 font-mono text-[10.5px] tracking-[.14em]">
          RAPORLAR · {rows.length}
        </div>

        {rows.length === 0 ? (
          <div className="text-ink/75 py-6 text-center text-[13.5px]">Henüz rapor yüklenmedi.</div>
        ) : (
          <div className="flex flex-col">
            <div
              className="border-ink/[.12] text-ink/75 grid gap-4 border-b pb-2.5 font-mono text-[10px] tracking-[.1em]"
              style={{ gridTemplateColumns: '1.5fr 1fr 1.3fr .6fr' }}
            >
              <span>TAKIM / RAPOR</span><span>KATEGORİ</span><span>HAKEM</span><span>ANALİZ</span>
            </div>

            {rows.map((r) => (
              <div
                key={r.reportId}
                className="border-ink/[.07] grid items-center gap-4 border-b py-3"
                style={{ gridTemplateColumns: '1.5fr 1fr 1.3fr .6fr' }}
              >
                <div className="min-w-0">
                  <Link
                    href={`/review/${r.reportId}`}
                    className="text-ink block truncate text-[13.5px] font-medium no-underline hover:underline"
                  >
                    {r.team}
                  </Link>
                  <div className="text-ink/[.45] mt-0.5 truncate font-mono text-[10.5px]">
                    {r.code} · {r.title}
                  </div>
                </div>

                <div className="text-ink/75 truncate text-[12.5px]">{r.category}</div>

                <div className="flex items-center gap-2">
                  <select
                    value={r.judgeId ?? ''}
                    disabled={pending || judges.length === 0}
                    onChange={(e) => {
                      setBusyRow(r.reportId);
                      const v = e.target.value;
                      if (!v) run(() => unassignReport(r.reportId), () => 'Atama kaldırıldı.');
                      else run(() => assignReport(r.reportId, v), () => 'Atama kaydedildi.');
                    }}
                    className={`border-ink/[.18] min-w-0 flex-1 border bg-white px-2 py-1.5 text-[12.5px] disabled:opacity-50 ${
                      r.judgeId ? 'text-ink' : 'text-danger'
                    }`}
                  >
                    <option value="">— atanmadı —</option>
                    {judges.map((j) => (
                      <option key={j.id} value={j.id}>{j.name}</option>
                    ))}
                  </select>
                  {busyRow === r.reportId && pending && (
                    <span className="text-ink/75 font-mono text-[10px]">…</span>
                  )}
                </div>

                <div className="text-ink/[.55] font-mono text-[10.5px]">
                  {r.checksTotal ? `${r.checksDone}/${r.checksTotal}` : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
