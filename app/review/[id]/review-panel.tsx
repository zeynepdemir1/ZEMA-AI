'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { CriterionCardData, ReviewData } from '@/lib/reports/queries';
import { approveAllCriteria, saveCriterionText, setCriterionApproval } from './actions';

const STATUS_META = {
  done: { label: 'YAPILDI', tone: 'text-success border-success' },
  partial: { label: 'KISMEN', tone: 'text-gold border-gold' },
  missing: { label: 'YAPILMADI', tone: 'text-danger border-danger' },
} as const;

export function ReviewPanel({ data }: { data: ReviewData }) {
  const { report, cards, similarity, progress } = data;
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const approvedCount = cards.filter((c) => c.origin === 'hakem').length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'İşlem başarısız.');
      else setEditing(null);
    });
  }

  return (
    <div className="flex min-w-0 flex-col">
      {/* ─── Rapor başlığı ─── */}
      <div className="border-ink/10 flex flex-wrap items-start justify-between gap-8 border-b bg-white px-8 py-5">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-3">
            <span className="text-ink/50 font-mono text-[11px]">{report.code}</span>
            <span className="bg-ink/[.06] text-ink/65 px-2 py-[3px] font-mono text-[10px] tracking-[.1em]">
              {report.category}
            </span>
            {progress.total > 0 && progress.done < progress.total && (
              <span className="text-teal border-teal border px-2 py-[3px] font-mono text-[10px] tracking-[.1em]">
                ANALİZ SÜRÜYOR · {progress.done}/{progress.total}
              </span>
            )}
            {progress.failed > 0 && (
              <span className="text-danger border-danger border px-2 py-[3px] font-mono text-[10px] tracking-[.1em]">
                {progress.failed} KONTROL BAŞARISIZ
              </span>
            )}
          </div>
          <h2 className="font-heading m-0 text-[24px] font-semibold">{report.team}</h2>
          <div className="text-ink/[.55] mt-1 text-[13px]">{report.title}</div>
        </div>

        <div className="flex flex-wrap items-center gap-[26px]">
          <Link
            href={`/review/${report.id}/similarity`}
            className="hover:bg-ink/[.06] hover:border-ink/[.18] block border border-transparent px-2.5 py-1.5 text-right no-underline transition-colors"
          >
            <div className="text-ink/50 mb-1 font-mono text-[10px] tracking-[.1em]">
              EN YÜKSEK BENZERLİK · {similarity.matchCount} EŞLEŞME
            </div>
            <div
              className={`font-mono text-[19px] ${similarity.maxPct >= similarity.threshold ? 'text-danger' : 'text-ink'}`}
            >
              %{similarity.maxPct} →
            </div>
          </Link>

          <div className="text-right">
            <div className="text-ink/50 mb-1 font-mono text-[10px] tracking-[.1em]">
              ONAYLANAN KRİTER
            </div>
            <div className="text-gold font-mono text-[19px]">
              {approvedCount}/{cards.length}
            </div>
          </div>

          <button
            disabled={pending || cards.length === 0}
            onClick={() => run(() => approveAllCriteria(report.id))}
            className="bg-ink cursor-pointer border-none px-5 py-3 font-sans text-[13.5px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'Kaydediliyor…' : 'Onayla ve Gönder'}
          </button>
        </div>
      </div>

      {/* ─── Renk kodu ─── */}
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

      {error && (
        <div className="border-danger text-danger border-b bg-[rgba(180,72,63,.06)] px-8 py-2.5 text-[13px]">
          {error}
        </div>
      )}

      {/* ─── Kriter kartları ─── */}
      <div className="bg-canvas flex flex-1 flex-col gap-4 overflow-auto px-8 pt-6 pb-[60px]">
        {cards.length === 0 && (
          <div className="border-ink/[.22] border border-dashed bg-white p-10 text-center">
            <div className="font-heading mb-2 text-[18px] font-semibold">
              Bu rapor için henüz kriter değerlendirmesi yok
            </div>
            <div className="text-ink/60 text-[13.5px]">
              Analiz kuyruğu tamamlandığında kriterler burada görünecek.
            </div>
          </div>
        )}

        {cards.map((card) => (
          <CriterionCard
            key={card.criterionId}
            card={card}
            reportId={report.id}
            pending={pending}
            editing={editing === card.criterionId}
            draft={draft}
            onDraft={setDraft}
            onStartEdit={() => {
              setEditing(card.criterionId);
              setDraft(card.text);
            }}
            onCancel={() => setEditing(null)}
            onSave={() => run(() => saveCriterionText(report.id, card.criterionId, draft))}
            onToggleApproval={() =>
              run(() => setCriterionApproval(report.id, card.criterionId, card.origin !== 'hakem'))
            }
          />
        ))}
      </div>
    </div>
  );
}

function CriterionCard({
  card,
  pending,
  editing,
  draft,
  onDraft,
  onStartEdit,
  onCancel,
  onSave,
  onToggleApproval,
}: {
  card: CriterionCardData;
  reportId: string;
  pending: boolean;
  editing: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onToggleApproval: () => void;
}) {
  const approved = card.origin === 'hakem';
  const status = STATUS_META[card.status];
  const unverified = card.evidence.filter((e) => !e.verified);

  return (
    <div
      className={`border-ink/10 border border-l-4 bg-white px-6 pt-[22px] pb-5 ${
        approved ? 'border-l-gold' : 'border-l-teal'
      }`}
    >
      <div className="mb-[14px] flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-ink/[.45] font-mono text-[11px]">{card.code}</span>
          <h3 className="font-heading m-0 text-[18px] font-semibold">{card.title}</h3>
          <span className={`border px-2 py-[3px] font-mono text-[10px] tracking-[.1em] ${status.tone}`}>
            {status.label}
          </span>
          {card.confidence !== null && (
            <span className="text-ink/[.45] font-mono text-[10px]">
              GÜVEN {card.confidence.toFixed(2)}
            </span>
          )}
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
        <div className="text-ink/[.45] mb-[5px] font-mono text-[10px] tracking-[.12em]">BEKLENTİ</div>
        <div className="text-ink/70 text-[13.5px] leading-[1.6]">{card.beklenti}</div>
      </div>

      <div className={`px-4 py-[14px] ${approved ? 'bg-[rgba(201,138,62,.07)]' : 'bg-[rgba(76,133,119,.07)]'}`}>
        <div className="mb-[9px] flex flex-wrap items-center justify-between gap-2">
          <span
            className={`font-mono text-[10px] tracking-[.12em] ${approved ? 'text-gold-ink' : 'text-teal-ink'}`}
          >
            {approved
              ? 'HAKEM METNİ · YARIŞMACIYA GÖNDERİLECEK'
              : 'AI DEĞERLENDİRMESİ · YARIŞMACIYA GÖRÜNMÜYOR'}
          </span>
          <span className="text-ink/[.45] font-mono text-[10px]">{card.ref}</span>
        </div>
        <div className="text-ink text-[14.5px] leading-[1.68]">{card.text}</div>
      </div>

      {/* Kanıt alıntıları — §4.5 doğrulama rozetleri */}
      {card.evidence.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="text-ink/[.45] font-mono text-[10px] tracking-[.12em]">
            KANIT · {card.evidence.length - unverified.length}/{card.evidence.length} DOĞRULANDI
          </div>
          {card.evidence.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-[12.5px] leading-[1.55]">
              <span
                className={`mt-0.5 shrink-0 border px-1.5 py-0.5 font-mono text-[9px] tracking-[.08em] ${
                  e.verified
                    ? 'text-success border-success'
                    : e.match === 'diacritics'
                      ? 'text-gold border-gold'
                      : 'text-danger border-danger'
                }`}
              >
                {e.verified ? '✓ DOĞRULANDI' : e.match === 'diacritics' ? '~ YAZIM FARKI' : '✕ DOĞRULANAMADI'}
              </span>
              <span className="text-ink/70 italic">
                “{e.quote}” <span className="text-ink/[.4] not-italic">— {e.section_ref}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="border-gold/50 mt-[14px] border bg-[rgba(201,138,62,.05)] p-[14px]">
          <div className="text-gold-ink mb-[9px] font-mono text-[10px] tracking-[.12em]">
            DOĞRUDAN DÜZENLE · METİN HAKEM ONAYLI OLARAK KAYDEDİLİR
          </div>
          <textarea
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            rows={5}
            className="border-ink/20 text-ink w-full resize-y border bg-white px-[13px] py-[11px] font-sans text-[14px] leading-[1.65]"
          />
          <div className="mt-[11px] flex gap-2.5">
            <button
              disabled={pending}
              onClick={onSave}
              className="bg-gold cursor-pointer border-none px-[18px] py-[9px] font-sans text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {pending ? 'Kaydediliyor…' : 'Kaydet ve Onayla'}
            </button>
            <button
              onClick={onCancel}
              className="border-ink/20 text-ink/70 cursor-pointer border bg-transparent px-[18px] py-[9px] font-sans text-[13px]"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}

      <div className="border-ink/[.08] mt-4 flex flex-wrap items-center gap-2.5 border-t pt-[14px]">
        <button
          onClick={onStartEdit}
          className="text-ink border-ink/[.22] cursor-pointer border bg-transparent px-4 py-[9px] font-sans text-[13px]"
        >
          Doğrudan düzenle
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <span className="text-ink/[.45] font-mono text-[10.5px]">
            {approved ? 'Hakem onaylı' : 'Yarışmacıya henüz görünmüyor'}
          </span>
          <button
            disabled={pending}
            onClick={onToggleApproval}
            className={`cursor-pointer px-[18px] py-[9px] font-sans text-[13px] font-semibold disabled:opacity-50 ${
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
}
