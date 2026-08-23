'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CARDS,
  CURRENT_JUDGE,
  HIZLI_TALIMATLAR,
  type CardOrigin,
  type CriterionCard,
  type CriterionStatus,
  type Report,
} from '@/lib/design/mock-data';

const STATUS_META: Record<CriterionStatus, { label: string; tone: string }> = {
  done: { label: 'YAPILDI', tone: 'text-success border-success' },
  partial: { label: 'KISMEN', tone: 'text-gold border-gold' },
  missing: { label: 'YAPILMADI', tone: 'text-danger border-danger' },
};

type ChatTurn = { from: 'hakem' | 'ai'; text: string };

type CardState = {
  origin: CardOrigin;
  text: string;
  mode: 'edit' | 'chat' | null;
  draft: string;
  msg: string;
  chat: ChatTurn[];
};

function initialState(c: CriterionCard): CardState {
  return { origin: c.origin, text: c.text, mode: null, draft: '', msg: '', chat: [] };
}

export function ReviewPanel({
  report,
  matchCount,
  maxPct,
  threshold,
}: {
  report: Report;
  matchCount: number;
  maxPct: number;
  threshold: number;
}) {
  const [state, setState] = useState<CardState[]>(() => CARDS.map(initialState));
  const approvedCount = state.filter((s) => s.origin === 'hakem').length;

  function patch(i: number, p: Partial<CardState>) {
    setState((s) => s.map((c, j) => (j === i ? { ...c, ...p } : c)));
  }

  /**
   * "AI ile Konuş" — prototipte talimata göre hazır iki varyanttan biri döner.
   * Gerçek akışta bu, callClaudeForCheck() ile bir Claude çağrısı olacak ve
   * düzeltme correction_log'a yazılacak (PLAN.md §4.5 "hafif öğrenme").
   */
  function rewrite(i: number, instruction: string) {
    const card = CARDS[i];
    const next = /kısalt|kısa/i.test(instruction) ? card.shorter : card.softer;
    setState((s) =>
      s.map((c, j) =>
        j === i
          ? {
              ...c,
              text: next,
              msg: '',
              chat: [
                ...c.chat,
                { from: 'hakem', text: instruction },
                { from: 'ai', text: 'Metni güncelledim. Onaylarsanız hakem mührüyle kaydedilir.' },
              ],
            }
          : c,
      ),
    );
  }

  return (
    <div className="flex min-w-0 flex-col">
      {/* ─── Rapor başlığı ─── */}
      <div className="border-ink/10 flex flex-wrap items-start justify-between gap-8 border-b bg-white px-8 py-5">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-3">
            <span className="text-ink/50 font-mono text-[11px]">{report.code}</span>
            <span className="bg-ink/[.06] text-ink/65 px-2 py-[3px] font-mono text-[10px] tracking-[.1em]">
              {report.category} · KATEGORİ UYGUN
            </span>
          </div>
          <h2 className="font-heading m-0 text-[24px] font-semibold">{report.team}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-[26px]">
          <Link
            href={`/review/${report.code}/similarity`}
            className="hover:bg-ink/[.06] hover:border-ink/[.18] block border border-transparent px-2.5 py-1.5 text-right no-underline transition-colors"
          >
            <div className="text-ink/50 mb-1 font-mono text-[10px] tracking-[.1em]">
              EN YÜKSEK BENZERLİK · {matchCount} EŞLEŞME
            </div>
            <div
              className={`font-mono text-[19px] ${maxPct >= threshold ? 'text-danger' : 'text-ink'}`}
            >
              %{maxPct} →
            </div>
          </Link>

          <div className="text-right">
            <div className="text-ink/50 mb-1 font-mono text-[10px] tracking-[.1em]">
              ONAYLANAN KRİTER
            </div>
            <div className="text-gold font-mono text-[19px]">{approvedCount}/6</div>
          </div>

          <button
            onClick={() => setState((s) => s.map((c) => ({ ...c, origin: 'hakem', mode: null })))}
            className="bg-ink cursor-pointer border-none px-5 py-3 font-sans text-[13.5px] font-semibold text-white"
          >
            Onayla ve Gönder
          </button>
        </div>
      </div>

      {/* ─── Renk kodu: teal = onaylanmamış AI, gold = hakem onaylı ─── */}
      <div className="bg-ink/[.03] border-ink/[.08] flex flex-wrap items-center gap-[22px] border-b px-8 py-2.5">
        <span className="text-ink/[.45] font-mono text-[10px] tracking-[.14em]">RENK KODU</span>
        <span className="text-ink/70 inline-flex items-center gap-2 text-[12.5px]">
          <span className="bg-teal inline-block h-[3px] w-[14px]" />
          AI taslağı — onay bekliyor, yarışmacıya görünmez
        </span>
        <span className="text-ink/70 inline-flex items-center gap-2 text-[12.5px]">
          <span className="bg-gold inline-block h-[3px] w-[14px]" />
          Hakem onaylı — nihai metin
        </span>
      </div>

      {/* ─── Kriter kartları ─── */}
      <div className="bg-canvas flex flex-1 flex-col gap-4 overflow-auto px-8 pt-6 pb-[60px]">
        {CARDS.map((card, i) => {
          const s = state[i];
          const approved = s.origin === 'hakem';
          const status = STATUS_META[card.status];

          return (
            <div
              key={card.code}
              className={`border-ink/10 border border-l-4 bg-white px-6 pt-[22px] pb-5 ${
                approved ? 'border-l-gold' : 'border-l-teal'
              }`}
            >
              <div className="mb-[14px] flex flex-wrap items-start justify-between gap-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-ink/[.45] font-mono text-[11px]">{card.code}</span>
                  <h3 className="font-heading m-0 text-[18px] font-semibold">{card.title}</h3>
                  <span
                    className={`border px-2 py-[3px] font-mono text-[10px] tracking-[.1em] ${status.tone}`}
                  >
                    {status.label}
                  </span>
                </div>
                <span
                  className={`px-2.5 py-[5px] font-mono text-[10px] tracking-[.12em] whitespace-nowrap text-white ${
                    approved ? 'bg-gold' : 'bg-teal'
                  }`}
                >
                  {approved ? '✓ HAKEM ONAYLI' : 'AI TASLAĞI · ONAY BEKLİYOR'}
                </span>
              </div>

              <div className="border-ink/[.15] mb-4 border-l-2 py-0.5 pl-[14px]">
                <div className="text-ink/[.45] mb-[5px] font-mono text-[10px] tracking-[.12em]">
                  BEKLENTİ
                </div>
                <div className="text-ink/70 text-[13.5px] leading-[1.6]">{card.beklenti}</div>
              </div>

              <div
                className={`px-4 py-[14px] ${
                  approved ? 'bg-[rgba(201,138,62,.07)]' : 'bg-[rgba(76,133,119,.07)]'
                }`}
              >
                <div className="mb-[9px] flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`font-mono text-[10px] tracking-[.12em] ${
                      approved ? 'text-gold-ink' : 'text-teal-ink'
                    }`}
                  >
                    {approved
                      ? 'HAKEM METNİ · YARIŞMACIYA GÖNDERİLECEK'
                      : 'AI DEĞERLENDİRMESİ · YARIŞMACIYA GÖRÜNMÜYOR'}
                  </span>
                  <span className="text-ink/[.45] font-mono text-[10px]">{card.ref}</span>
                </div>
                <div className="text-ink text-[14.5px] leading-[1.68]">{s.text}</div>
              </div>

              {s.mode === 'edit' && (
                <div className="border-gold/50 mt-[14px] border bg-[rgba(201,138,62,.05)] p-[14px]">
                  <div className="text-gold-ink mb-[9px] font-mono text-[10px] tracking-[.12em]">
                    DOĞRUDAN DÜZENLE · METİN HAKEM ONAYLI OLARAK KAYDEDİLİR
                  </div>
                  <textarea
                    value={s.draft}
                    onChange={(e) => patch(i, { draft: e.target.value })}
                    rows={4}
                    className="border-ink/20 text-ink w-full resize-y border bg-white px-[13px] py-[11px] font-sans text-[14px] leading-[1.65]"
                  />
                  <div className="mt-[11px] flex gap-2.5">
                    <button
                      onClick={() => patch(i, { text: s.draft, origin: 'hakem', mode: null })}
                      className="bg-gold cursor-pointer border-none px-[18px] py-[9px] font-sans text-[13px] font-semibold text-white"
                    >
                      Kaydet ve Onayla
                    </button>
                    <button
                      onClick={() => patch(i, { mode: null })}
                      className="border-ink/20 text-ink/70 cursor-pointer border bg-transparent px-[18px] py-[9px] font-sans text-[13px]"
                    >
                      Vazgeç
                    </button>
                  </div>
                </div>
              )}

              {s.mode === 'chat' && (
                <div className="border-teal/[.45] mt-[14px] border bg-[rgba(76,133,119,.05)] p-[14px]">
                  <div className="text-teal-ink mb-[11px] font-mono text-[10px] tracking-[.12em]">
                    AI İLE KONUŞ · METNİ YENİDEN YAZDIR
                  </div>

                  {s.chat.length > 0 && (
                    <div className="mb-3 flex flex-col gap-[9px]">
                      {s.chat.map((m, k) => (
                        <div
                          key={k}
                          className={`max-w-[78%] px-3 py-[9px] text-[13px] leading-[1.6] ${
                            m.from === 'hakem'
                              ? 'bg-ink self-end text-white'
                              : 'border-teal/40 text-ink self-start border bg-white'
                          }`}
                        >
                          {m.text}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mb-2.5 flex flex-wrap gap-2">
                    {HIZLI_TALIMATLAR.map((label) => (
                      <button
                        key={label}
                        onClick={() => rewrite(i, label)}
                        className="text-teal-ink border-teal/40 cursor-pointer border bg-white px-3 py-1.5 font-sans text-[12px]"
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      value={s.msg}
                      onChange={(e) => patch(i, { msg: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && s.msg.trim()) rewrite(i, s.msg.trim());
                      }}
                      placeholder="Örn. bu çok sert, daha yapıcı bir dille yaz"
                      className="border-ink/[.18] text-ink flex-1 border bg-white px-3 py-2.5 font-sans text-[13.5px]"
                    />
                    <button
                      onClick={() => s.msg.trim() && rewrite(i, s.msg.trim())}
                      className="bg-teal cursor-pointer border-none px-[18px] py-2.5 font-sans text-[13px] font-semibold text-white"
                    >
                      Gönder
                    </button>
                  </div>
                </div>
              )}

              <div className="border-ink/[.08] mt-4 flex flex-wrap items-center gap-2.5 border-t pt-[14px]">
                <button
                  onClick={() => patch(i, { mode: s.mode === 'edit' ? null : 'edit', draft: s.text })}
                  className="text-ink border-ink/[.22] cursor-pointer border bg-transparent px-4 py-[9px] font-sans text-[13px]"
                >
                  Doğrudan düzenle
                </button>
                <button
                  onClick={() => patch(i, { mode: s.mode === 'chat' ? null : 'chat' })}
                  className="text-teal-ink border-teal/[.45] cursor-pointer border bg-transparent px-4 py-[9px] font-sans text-[13px]"
                >
                  AI ile konuş
                </button>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  <span className="text-ink/[.45] font-mono text-[10.5px]">
                    {approved
                      ? `${CURRENT_JUDGE.name} · ${CURRENT_JUDGE.stampedAt}`
                      : 'Yarışmacıya henüz görünmüyor'}
                  </span>
                  <button
                    onClick={() => patch(i, { origin: approved ? 'ai' : 'hakem', mode: null })}
                    className={`cursor-pointer px-[18px] py-[9px] font-sans text-[13px] font-semibold ${
                      approved
                        ? 'border-ink/[.22] text-ink/70 border bg-transparent'
                        : 'bg-gold border-none text-white'
                    }`}
                  >
                    {approved ? 'Onayı geri al' : 'Onayla ve mühürle'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
