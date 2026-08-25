'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CriterionCardData, ReviewData } from '@/lib/reports/queries';
import {
  approveAllCriteria,
  requeueFailedChecks,
  saveCriterionText,
  setCriterionApproval,
} from './actions';
import { CheckPanels } from './check-panels';

/** Yeniden kuyruğa alınan işleri işlemek için kaç tur tick atılacak. */
const MAX_TICKS = 20;

/**
 * Başarısız kontrolleri kurtarma düğmesi.
 *
 * Kuyruk yalnızca `pending` işleri kapıyor; `failed` olan iş orada kalıyor
 * ve hakemin ekranında kalıcı bir "2 KONTROL BAŞARISIZ" rozeti bırakıyordu.
 * Önce işler pending'e döndürülüyor, sonra kuyruk buradan döndürülüyor —
 * yükleme formundaki desenin aynısı (Vercel Cron'a güvenilmiyor).
 */
function RetryFailed({ reportId, failed }: { reportId: string; failed: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<'idle' | 'running' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function onRetry() {
    setPhase('running');
    setMessage(null);
    const r = await requeueFailedChecks(reportId);
    if (!r.ok) {
      setPhase('error');
      setMessage(r.error ?? 'Yeniden kuyruğa alınamadı.');
      return;
    }
    if (!r.requeued) {
      setPhase('idle');
      router.refresh();
      return;
    }
    for (let i = 0; i < MAX_TICKS; i++) {
      const t = await fetch('/api/jobs/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      });
      const td = (await t.json().catch(() => ({}))) as { done?: boolean; reportPending?: number };
      if (td.done || td.reportPending === 0) break;
    }
    setPhase('idle');
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={onRetry}
        disabled={phase === 'running'}
        className="border-danger text-danger hover:bg-danger/[.06] border px-2 py-[3px] font-mono text-[11px] tracking-[.1em] transition-colors disabled:opacity-50"
      >
        {phase === 'running' ? 'YENİDEN DENENİYOR…' : `${failed} KONTROL BAŞARISIZ · YENİDEN DENE`}
      </button>
      {message && <span className="text-danger text-[13px] leading-[1.6]">{message}</span>}
    </>
  );
}

const STATUS_META = {
  done: { label: 'YAPILDI', tone: 'text-success border-success' },
  partial: { label: 'KISMEN', tone: 'text-gold-ink border-gold' },
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
            <span className="text-ink/75 font-mono text-[12px]">{report.code}</span>
            <span className="bg-ink/[.06] text-ink/85 px-2 py-[3px] font-mono text-[11px] tracking-[.1em]">
              {report.category}
            </span>
            {progress.total > 0 && progress.done < progress.total && (
              <span className="text-teal-ink border-teal border px-2 py-[3px] font-mono text-[11px] tracking-[.1em]">
                ANALİZ SÜRÜYOR · {progress.done}/{progress.total}
              </span>
            )}
            {progress.failed > 0 && (
              <RetryFailed reportId={report.id} failed={progress.failed} />
            )}
          </div>
          <h2 className="font-heading m-0 text-[24px] font-semibold">{report.team}</h2>
          <div className="text-ink/85 mt-1.5 text-[14px] leading-[1.5]">{report.title}</div>
        </div>

        <div className="flex flex-wrap items-center gap-[26px]">
          <Link
            href={`/review/${report.id}/similarity`}
            className="hover:bg-ink/[.06] hover:border-ink/[.18] block border border-transparent px-2.5 py-1.5 text-right no-underline transition-colors"
          >
            <div className="text-ink/75 mb-1 font-mono text-[11px] tracking-[.1em]">
              EN YÜKSEK BENZERLİK · {similarity.matchCount} EŞLEŞME
            </div>
            <div
              className={`font-mono text-[19px] ${similarity.maxPct >= similarity.threshold ? 'text-danger' : 'text-ink'}`}
            >
              %{similarity.maxPct} →
            </div>
          </Link>

          <div className="text-right">
            <div className="text-ink/75 mb-1 font-mono text-[11px] tracking-[.1em]">
              ONAYLANAN KRİTER
            </div>
            <div className="text-gold-ink font-mono text-[19px]">
              {approvedCount}/{cards.length}
            </div>
          </div>

          <button
            disabled={pending || cards.length === 0}
            onClick={() => run(() => approveAllCriteria(report.id))}
            className="bg-t3-blue cursor-pointer border-none px-5 py-3 font-sans text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'Kaydediliyor…' : 'Onayla ve Gönder'}
          </button>
        </div>
      </div>

      {/* ─── Renk kodu ─── */}
      <div className="bg-ink/[.03] border-ink/[.08] flex flex-wrap items-center gap-[22px] border-b px-8 py-3">
        <span className="text-ink/75 font-mono text-[11px] tracking-[.12em]">RENK KODU</span>
        <span className="text-ink/85 inline-flex items-center gap-2.5 text-[14px] leading-[1.5]">
          <span className="bg-teal inline-block h-[3px] w-[14px]" />
          AI taslağı — onay bekliyor, yarışmacıya görünmez
        </span>
        <span className="text-ink/85 inline-flex items-center gap-2.5 text-[14px] leading-[1.5]">
          <span className="bg-gold inline-block h-[3px] w-[14px]" />
          Hakem onaylı — nihai metin
        </span>
      </div>

      {error && (
        <div className="border-danger text-danger border-b bg-[rgba(180,72,63,.06)] px-8 py-2.5 text-[13px]">
          {error}
        </div>
      )}

      {/* ─── Tek panel: altı AI kontrolü, kriter kartları içinde ─── */}
      <div className="bg-canvas flex flex-1 flex-col gap-4 overflow-auto px-8 pt-6 pb-[60px]">
        <CheckPanels
          checks={data.checks}
          reportId={report.id}
          cards={cards}
          renderCards={() =>
            cards.length === 0 ? (
              <div className="border-ink/30 text-ink/75 border border-dashed bg-white px-6 py-6 text-center text-[14px]">
                Bu rapor için henüz kriter değerlendirmesi yok.
              </div>
            ) : (
              cards.map((card) => (
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
                    run(() =>
                      setCriterionApproval(report.id, card.criterionId, card.origin !== 'hakem'),
                    )
                  }
                />
              ))
            )
          }
        />
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
  const verified = card.evidence.filter((e) => e.verified).length;

  return (
    <article
      className={`border-ink/15 border border-l-4 bg-white px-7 pt-6 pb-6 ${
        approved ? 'border-l-gold' : 'border-l-teal'
      }`}
    >
      {/* Başlık + rubrik referansı (kat değil) */}
      <header className="mb-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-ink/75 font-mono text-[12px]">{card.code}</span>
            <h3 className="font-heading text-ink m-0 text-[19px] leading-[1.3] font-semibold">
              {card.title}
            </h3>
            <span
              className={`border px-2 py-1 font-mono text-[10px] tracking-[.08em] ${status.tone}`}
            >
              {status.label}
            </span>
          </div>
          <span
            className={`px-2.5 py-1 font-mono text-[10px] tracking-[.1em] whitespace-nowrap text-white ${
              approved ? 'bg-gold-ink' : 'bg-teal-ink'
            }`}
          >
            {approved ? '✓ HAKEM ONAYLI' : 'AI TASLAĞI · ONAY BEKLİYOR'}
          </span>
        </div>
        <p className="text-ink/75 m-0 text-[13px] leading-[1.6]">
          <span className="font-mono text-[11px] tracking-[.08em]">BEKLENTİ:</span>{' '}
          {card.beklenti}
        </p>
      </header>

      {/* KAT 1 — AI değerlendirmesi (nötr) */}
      <section className="mb-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-teal-ink m-0 font-mono text-[11px] tracking-[.1em]">
            AI DEĞERLENDİRMESİ · YARIŞMACIYA GÖRÜNMÜYOR
          </h4>
          <div className="flex items-center gap-3">
            {card.confidence !== null && (
              <span className="text-ink/75 font-mono text-[11px]">
                GÜVEN {card.confidence.toFixed(2)}
              </span>
            )}
            <span className="text-ink/75 font-mono text-[11px]">{card.ref}</span>
          </div>
        </div>
        <p className="text-ink m-0 text-[14px] leading-[1.75]">
          {approved ? card.text : card.text}
        </p>
      </section>

      {/* KAT 2 — Kanıt */}
      {card.evidence.length > 0 && (
        <section className="mb-4">
          <h4 className="text-ink/75 mb-2 m-0 font-mono text-[11px] tracking-[.1em]">
            KANIT · {verified}/{card.evidence.length} DOĞRULANDI
          </h4>
          <div className="flex flex-col gap-2">
            {card.evidence.map((e, i) => (
              <div
                key={i}
                className="border-l-teal border-ink/10 border border-l-[3px] bg-[rgba(76,133,119,.06)] px-4 py-3"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className={`border px-1.5 py-0.5 font-mono text-[10px] tracking-[.08em] ${
                      e.verified
                        ? 'text-success border-success'
                        : e.match === 'diacritics'
                          ? 'text-gold-ink border-gold'
                          : 'text-danger border-danger'
                    }`}
                  >
                    {e.verified
                      ? '✓ DOĞRULANDI'
                      : e.match === 'diacritics'
                        ? '~ YAZIM FARKI'
                        : '✕ DOĞRULANAMADI'}
                  </span>
                  <span className="text-ink/75 font-mono text-[11px]">{e.section_ref}</span>
                </div>
                <div className="text-ink text-[14px] leading-[1.7]">“{e.quote}”</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* KAT 3 — Hakem metni / düzenleme (belirgin ayrı kart) */}
      {editing ? (
        <section className="border-gold bg-[rgba(201,138,62,.07)] mb-4 border-2 px-4 py-4">
          <h4 className="text-gold-ink mb-2 m-0 font-mono text-[11px] tracking-[.1em]">
            HAKEM METNİ · DÜZENLENİYOR
          </h4>
          <p className="text-ink/75 mb-3 m-0 text-[13px] leading-[1.6]">
            Kaydettiğinizde bu metin hakem onaylı sayılır ve yarışmacıya bu hâliyle gider.
          </p>
          <textarea
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            rows={6}
            className="border-ink/30 text-ink w-full resize-y border bg-white px-4 py-3 text-[14px] leading-[1.75]"
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              disabled={pending}
              onClick={onSave}
              className="bg-gold-ink cursor-pointer border-none px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {pending ? 'Kaydediliyor…' : 'Kaydet ve Onayla'}
            </button>
            <button
              onClick={onCancel}
              className="border-ink/30 text-ink cursor-pointer border bg-white px-5 py-2.5 text-[14px]"
            >
              Vazgeç
            </button>
          </div>
        </section>
      ) : approved ? (
        <section className="border-gold bg-[rgba(201,138,62,.07)] mb-4 border-2 px-4 py-4">
          <h4 className="text-gold-ink mb-2 m-0 font-mono text-[11px] tracking-[.1em]">
            HAKEM METNİ · YARIŞMACIYA GÖNDERİLECEK
          </h4>
          <p className="text-ink m-0 text-[14px] leading-[1.75]">{card.text}</p>
        </section>
      ) : null}

      {/* Aksiyon çubuğu */}
      <footer className="border-ink/10 flex flex-wrap items-center gap-3 border-t pt-4">
        {!editing && (
          <button
            onClick={onStartEdit}
            className="border-ink/30 text-ink cursor-pointer border bg-white px-4 py-2.5 text-[14px]"
          >
            Doğrudan düzenle
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-4">
          <span className="text-ink/75 text-[13px]">
            {approved ? 'Hakem onaylı' : 'Yarışmacıya henüz görünmüyor'}
          </span>
          <button
            disabled={pending}
            onClick={onToggleApproval}
            className={`cursor-pointer px-5 py-2.5 text-[14px] font-semibold disabled:opacity-50 ${
              approved
                ? 'border-ink/30 text-ink border bg-white'
                : 'bg-gold-ink border-none text-white'
            }`}
          >
            {approved ? 'Onayı geri al' : 'Onayla ve mühürle'}
          </button>
        </div>
      </footer>
    </article>
  );
}
