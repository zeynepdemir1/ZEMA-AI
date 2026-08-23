'use client';

import { useState } from 'react';
import { MATCH_META, type Match, type MatchVerdict, type Report } from '@/lib/design/mock-data';

/** Ortak pasajı vurgulamak için metni üçe böler. */
function segment(text: string, overlap?: string) {
  if (!overlap || !text.includes(overlap)) return [{ text, hit: false }];
  const [head, ...rest] = text.split(overlap);
  return [
    { text: head, hit: false },
    { text: overlap, hit: true },
    { text: rest.join(overlap), hit: false },
  ].filter((s) => s.text.length > 0 || s.hit);
}

const HIT = 'bg-[rgba(76,133,119,.24)] shadow-[0_1px_0_#4C8577]';



const KIND_LABEL = { metin: 'METİN BENZERLİĞİ' } as const;

export function SimilarityList({ report, matches }: { report: Report; matches: Match[] }) {
  // Hakem HER eşleşmeyi bağımsız değerlendirir (PLAN.md §4.4).
  const [verdicts, setVerdicts] = useState<Record<string, MatchVerdict>>({});

  const sorted = [...matches].sort((a, b) => b.pct - a.pct);

  return (
    <div className="flex flex-col gap-4">
      {sorted.map((m, i) => {
        const meta = MATCH_META[`${report.code}#${m.code}`] ?? { kind: 'metin' as const };
        const verdict = verdicts[m.code] ?? null;
        const pctTone = m.pct >= 40 ? 'text-danger' : m.pct >= 20 ? 'text-gold' : 'text-ink';
        const barColor = m.pct >= 40 ? '#B4483F' : m.pct >= 20 ? '#C98A3E' : '#1B2A4A';

        const set = (v: MatchVerdict) =>
          setVerdicts((s) => ({ ...s, [m.code]: s[m.code] === v ? null : v }));

        return (
          <div key={m.code} className="border-ink/10 border bg-white px-[26px] pt-6 pb-[22px]">
            {/* Sıra + takım + yüzde */}
            <div className="mb-4 flex flex-wrap items-start justify-between gap-7">
              <div className="flex items-start gap-[14px]">
                <span className="text-ink/[.35] pt-[5px] font-mono text-[11px]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-heading m-0 mb-[5px] text-[19px] font-semibold">{m.team}</h3>
                  <div className="text-ink/50 font-mono text-[10.5px]">{m.code}</div>
                </div>
              </div>
              <div className="min-w-[130px] text-right">
                <div className={`font-mono text-[30px] leading-none ${pctTone}`}>%{m.pct}</div>
                <div className="bg-ink/[.09] mt-[9px] h-[5px]">
                  <div
                    className="h-[5px]"
                    style={{ width: `${m.pct}%`, background: barColor }}
                  />
                </div>
              </div>
            </div>

            <div className="mb-2.5">
              <span className="text-ink border-ink/[.28] border px-[9px] py-1 font-mono text-[10px] tracking-[.12em]">
                {KIND_LABEL[meta.kind]}
              </span>
            </div>

            <div className="border-teal mb-4 border-l-2 bg-[rgba(76,133,119,.07)] px-4 py-[14px]">
              <div className="text-teal-ink mb-2 font-mono text-[10px] tracking-[.12em]">
                AI ANALİZİ
              </div>
              <div className="text-ink text-[14px] leading-[1.68]">{m.analysis}</div>
            </div>

            {/* Yan yana karşılaştırma — eş zamanlı, sekans değil */}
            <div className="mb-[14px] grid grid-cols-1 gap-[14px] md:grid-cols-2">
              {(
                [
                  {
                    label: 'BU RAPOR',
                    team: report.team,
                    ref: m.thisRef,
                    excerpt: m.thisExcerpt,
                  },
                  {
                    label: 'KARŞILAŞTIRILAN RAPOR',
                    team: m.team,
                    ref: m.otherRef,
                    excerpt: m.otherExcerpt,
                  },
                ]
              ).map((side) => (
                <div
                  key={side.label}
                  className="border-ink/[.14] bg-canvas flex flex-col border"
                >
                  <div className="border-ink/10 border-b px-[14px] py-2.5">
                    <div className="text-ink/[.45] mb-1 font-mono text-[9.5px] tracking-[.1em]">
                      {side.label}
                    </div>
                    <div className="text-[13px] font-semibold">{side.team}</div>
                    <div className="text-ink/50 mt-[3px] font-mono text-[9.5px]">{side.ref}</div>
                  </div>
                  <div className="flex-1 px-[14px] py-[13px]">
                    {(
                      <div className="text-ink text-[13px] leading-[1.8]">
                        {segment(side.excerpt, meta.overlap).map((seg, k) => (
                          <span key={k} className={seg.hit ? HIT : undefined}>
                            {seg.text}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {meta.caption && (
              <div className="text-ink/50 mb-3 font-mono text-[10px] tracking-[.08em]">
                {meta.caption}
              </div>
            )}

            {/* Hakem kararı */}
            <div className="border-ink/[.08] flex flex-wrap items-center gap-2.5 border-t pt-[14px]">
              <button
                onClick={() => set('real')}
                className={`cursor-pointer border px-4 py-[9px] font-sans text-[13px] font-semibold ${
                  verdict === 'real'
                    ? 'border-danger bg-danger text-white'
                    : 'border-danger/[.45] text-danger bg-transparent'
                }`}
              >
                Gerçek Benzerlik Olarak İşaretle
              </button>
              <button
                onClick={() => set('false')}
                className={`cursor-pointer border px-4 py-[9px] font-sans text-[13px] font-semibold ${
                  verdict === 'false'
                    ? 'border-ink bg-ink text-white'
                    : 'border-ink/[.22] text-ink/70 bg-transparent'
                }`}
              >
                Yanlış Pozitif — Yoksay
              </button>
              {verdict && (
                <span
                  className={`border px-[9px] py-1 font-mono text-[10px] tracking-[.12em] ${
                    verdict === 'real'
                      ? 'text-danger border-danger'
                      : 'text-ink/[.45] border-ink/[.45]'
                  }`}
                >
                  {verdict === 'real'
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
