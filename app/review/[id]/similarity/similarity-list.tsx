'use client';

import { useTransition } from 'react';
import type { SimilarityMatch } from '@/lib/reports/queries';
import { setPairVerdict } from './actions';

/** Ortak pasajı vurgulamak için: b metninin a içindeki karşılığını işaretle. */
function highlight(text: string, needle: string) {
  if (!needle || !text.includes(needle)) return [{ text, hit: false }];
  const [head, ...rest] = text.split(needle);
  return [
    { text: head, hit: false },
    { text: needle, hit: true },
    { text: rest.join(needle), hit: false },
  ].filter((s) => s.text || s.hit);
}

export function SimilarityList({
  reportId,
  reportTeam,
  matches,
}: {
  reportId: string;
  reportTeam: string;
  matches: SimilarityMatch[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      {matches.map((m, i) => {
        const tone = m.semanticScore >= 40 ? 'text-danger' : m.semanticScore >= 20 ? 'text-gold-ink' : 'text-ink';
        const bar = m.semanticScore >= 40 ? '#B4483F' : m.semanticScore >= 20 ? '#C98A3E' : '#1B2A4A';
        const set = (v: SimilarityMatch['verdict']) =>
          startTransition(async () => {
            await setPairVerdict(reportId, m.pairId, m.verdict === v ? 'pending' : v);
          });

        return (
          <div key={m.pairId} className="border-ink/10 border bg-white px-[26px] pt-6 pb-[22px]">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-7">
              <div className="flex items-start gap-[14px]">
                <span className="text-ink/[.35] pt-[5px] font-mono text-[11px]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-heading m-0 mb-[5px] text-[19px] font-semibold">{m.otherTeam}</h3>
                  <div className="text-ink/75 font-mono text-[10.5px]">
                    {m.otherCode}
                    {m.lexicalScore !== null && ` · trigram ${m.lexicalScore}`}
                  </div>
                </div>
              </div>
              <div className="min-w-[130px] text-right">
                <div className={`font-mono text-[30px] leading-none ${tone}`}>%{m.semanticScore}</div>
                <div className="bg-ink/[.09] mt-[9px] h-[5px]">
                  <div className="h-[5px]" style={{ width: `${m.semanticScore}%`, background: bar }} />
                </div>
              </div>
            </div>

            <div className="mb-2.5">
              <span className="text-ink border-ink/[.28] border px-[9px] py-1 font-mono text-[10px] tracking-[.12em]">
                METİN BENZERLİĞİ
              </span>
            </div>

            {m.assessment && (
              <div className="border-teal mb-4 border-l-2 bg-[rgba(76,133,119,.07)] px-4 py-[14px]">
                <div className="text-teal-ink mb-2 font-mono text-[10px] tracking-[.12em]">AI ANALİZİ</div>
                <div className="text-ink text-[14px] leading-[1.68]">{m.assessment}</div>
              </div>
            )}

            {m.passages.length === 0 ? (
              <div className="border-ink/[.18] text-ink/75 mb-[14px] border border-dashed px-4 py-3 text-[13px]">
                AI benzerlik iddia etti ama eşleşen pasaj göstermedi — bu sonuç
                <span className="font-mono"> insufficient_evidence </span>
                olarak işaretlendi.
              </div>
            ) : (
              m.passages.map((p, k) => (
                <div key={k} className="mb-[14px]">
                  <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2">
                    {[
                      { label: 'BU RAPOR', team: reportTeam, ref: p.a_section_ref, text: p.a, other: p.b },
                      { label: 'KARŞILAŞTIRILAN RAPOR', team: m.otherTeam, ref: p.b_section_ref, text: p.b, other: p.a },
                    ].map((side) => (
                      <div key={side.label} className="border-ink/[.14] bg-canvas flex flex-col border">
                        <div className="border-ink/10 border-b px-[14px] py-2.5">
                          <div className="text-ink/[.45] mb-1 font-mono text-[9.5px] tracking-[.1em]">
                            {side.label}
                          </div>
                          <div className="text-[13px] font-semibold">{side.team}</div>
                          <div className="text-ink/75 mt-[3px] font-mono text-[9.5px]">
                            {side.ref || '—'}
                          </div>
                        </div>
                        <div className="text-ink flex-1 px-[14px] py-[13px] text-[13px] leading-[1.8]">
                          {highlight(side.text, longestCommon(side.text, side.other)).map((seg, x) => (
                            <span
                              key={x}
                              className={seg.hit ? 'bg-[rgba(76,133,119,.24)] shadow-[0_1px_0_#4C8577]' : undefined}
                            >
                              {seg.text}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {p.note && (
                    <div className="text-ink/75 mt-2 font-mono text-[10px] tracking-[.08em]">{p.note}</div>
                  )}
                </div>
              ))
            )}

            <div className="border-ink/[.08] flex flex-wrap items-center gap-2.5 border-t pt-[14px]">
              <button
                disabled={pending}
                onClick={() => set('confirmed')}
                className={`cursor-pointer border px-4 py-[9px] font-sans text-[13px] font-semibold disabled:opacity-50 ${
                  m.verdict === 'confirmed'
                    ? 'border-danger bg-danger text-white'
                    : 'border-danger/[.45] text-danger bg-transparent'
                }`}
              >
                Gerçek Benzerlik Olarak İşaretle
              </button>
              <button
                disabled={pending}
                onClick={() => set('false_positive')}
                className={`cursor-pointer border px-4 py-[9px] font-sans text-[13px] font-semibold disabled:opacity-50 ${
                  m.verdict === 'false_positive'
                    ? 'border-ink bg-ink text-white'
                    : 'border-ink/[.22] text-ink/75 bg-transparent'
                }`}
              >
                Yanlış Pozitif — Yoksay
              </button>
              {m.verdict !== 'pending' && (
                <span
                  className={`border px-[9px] py-1 font-mono text-[10px] tracking-[.12em] ${
                    m.verdict === 'confirmed' ? 'text-danger border-danger' : 'text-ink/[.45] border-ink/[.45]'
                  }`}
                >
                  {m.verdict === 'confirmed'
                    ? '✕ GERÇEK BENZERLİK OLARAK İŞARETLENDİ'
                    : '○ YANLIŞ POZİTİF · YOKSAYILDI'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** İki metindeki en uzun ortak kelime dizisini bulur (vurgulama için). */
function longestCommon(a: string, b: string): string {
  const wa = a.split(/\s+/);
  let best = '';
  for (let i = 0; i < wa.length; i++) {
    for (let j = i + 3; j <= wa.length; j++) {
      const cand = wa.slice(i, j).join(' ');
      if (cand.length > best.length && b.includes(cand)) best = cand;
    }
  }
  return best;
}
