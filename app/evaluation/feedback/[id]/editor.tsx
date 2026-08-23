'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import type { FeedbackContent, FeedbackDraft } from '@/lib/reports/queries';
import { publishFeedback, saveFeedbackDraft, unpublishFeedback } from './actions';

const LABEL = 'text-ink/60 mb-2 block font-mono text-[10.5px] tracking-[.12em]';
const AREA =
  'border-ink/[.18] text-ink w-full resize-y border bg-white px-3 py-2.5 font-sans text-[13.5px] leading-[1.6]';

export function FeedbackEditor({
  draft,
  canPublish,
}: {
  draft: FeedbackDraft;
  /** §3.1: yalnızca Değerlendirme Yöneticisi yayımlar. Yarışma Yöneticisi okur. */
  canPublish: boolean;
}) {
  const [content, setContent] = useState<FeedbackContent>(draft.content ?? {});
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const published = draft.isPublished;
  const readOnly = published || !canPublish;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.ok ? okText : (r.error ?? 'Hata') });
    });
  }

  const setList = (key: 'strengths' | 'next_steps', text: string) =>
    setContent((c) => ({ ...c, [key]: text.split('\n').map((s) => s.trim()).filter(Boolean) }));

  const setImprovement = (i: number, field: string, value: string) =>
    setContent((c) => ({
      ...c,
      improvements: (c.improvements ?? []).map((x, j) => (j === i ? { ...x, [field]: value } : x)),
    }));

  return (
    <div className="flex flex-col gap-5">
      {/* Yarışmacıya ne gideceğinin uyarısı */}
      <div className="border-ink/[.12] bg-ink/[.03] flex items-start gap-3 border px-[22px] py-4">
        <span className="text-gold font-mono text-[13px]">◆</span>
        <span className="text-ink/[.72] text-[13px] leading-[1.6]">
          Bu metin <strong>yarışmacıya aynen gidecek</strong>. Ham AI analizi, puan ve sıralama
          bilgisi buraya girmemeli. Yayımlamadan önce okuyun.
        </span>
      </div>

      <div className="border-ink/10 border bg-white p-6">
        <label className={LABEL} htmlFor="summary">ÖZET</label>
        <textarea
          id="summary"
          rows={3}
          disabled={readOnly}
          value={content.summary ?? ''}
          onChange={(e) => setContent((c) => ({ ...c, summary: e.target.value }))}
          className={`${AREA} mb-5 disabled:opacity-60`}
        />

        <label className={LABEL} htmlFor="strengths">
          GÜÇLÜ YÖNLER · her satır bir madde ({(content.strengths ?? []).length})
        </label>
        <textarea
          id="strengths"
          rows={4}
          disabled={readOnly}
          value={(content.strengths ?? []).join('\n')}
          onChange={(e) => setList('strengths', e.target.value)}
          className={`${AREA} mb-5 disabled:opacity-60`}
        />

        <div className={LABEL}>
          GELİŞTİRİLECEK ALANLAR ({(content.improvements ?? []).length})
        </div>
        <div className="mb-5 flex flex-col gap-3">
          {(content.improvements ?? []).map((imp, i) => (
            <div key={i} className="border-ink/[.14] border p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  disabled={readOnly}
                  value={imp.area}
                  onChange={(e) => setImprovement(i, 'area', e.target.value)}
                  className="border-ink/[.18] flex-1 border px-2.5 py-1.5 text-[13px] font-semibold disabled:opacity-60"
                />
                <select
                  disabled={readOnly}
                  value={imp.priority}
                  onChange={(e) => setImprovement(i, 'priority', e.target.value)}
                  className="border-ink/[.18] border px-2 py-1.5 font-mono text-[11px] disabled:opacity-60"
                >
                  <option value="high">yüksek</option>
                  <option value="medium">orta</option>
                  <option value="low">düşük</option>
                </select>
              </div>
              <textarea
                disabled={readOnly}
                rows={2}
                value={imp.what}
                onChange={(e) => setImprovement(i, 'what', e.target.value)}
                className={`${AREA} mb-2 disabled:opacity-60`}
                placeholder="Ne eksik?"
              />
              <textarea
                disabled={readOnly}
                rows={2}
                value={imp.how}
                onChange={(e) => setImprovement(i, 'how', e.target.value)}
                className={`${AREA} disabled:opacity-60`}
                placeholder="Nasıl düzeltilir? (somut adım)"
              />
            </div>
          ))}
          {(content.improvements ?? []).length === 0 && (
            <div className="text-ink/50 text-[13px]">Madde yok.</div>
          )}
        </div>

        <label className={LABEL} htmlFor="steps">
          SONRAKİ ADIMLAR · her satır bir madde ({(content.next_steps ?? []).length})
        </label>
        <textarea
          id="steps"
          rows={3}
          disabled={readOnly}
          value={(content.next_steps ?? []).join('\n')}
          onChange={(e) => setList('next_steps', e.target.value)}
          className={`${AREA} disabled:opacity-60`}
        />
      </div>

      {msg && (
        <div
          className={`border px-4 py-2.5 text-[13px] ${
            msg.ok ? 'border-success text-success bg-[rgba(63,125,92,.06)]' : 'border-danger text-danger bg-[rgba(180,72,63,.06)]'
          }`}
        >
          {msg.text}
        </div>
      )}

      {!canPublish && (
        <div className="border-ink/[.22] text-ink/70 border bg-[rgba(27,42,74,.03)] px-4 py-3 text-[13px] leading-[1.55]">
          Bu ekranı görüntüleyebilirsiniz ancak geri bildirim yayımlama yetkisi
          <strong> Değerlendirme Yöneticisi</strong>&apos;ne aittir.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!canPublish ? null : published ? (
          <>
            <span className="text-gold border-gold border px-3 py-2 font-mono text-[10.5px] tracking-[.12em]">
              ✓ YAYIMLANDI
              {draft.publishedAt &&
                ` · ${new Date(draft.publishedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`}
            </span>
            <button
              disabled={pending}
              onClick={() => run(() => unpublishFeedback(draft.report.id), 'Yayından kaldırıldı.')}
              className="border-ink/[.22] text-ink/70 cursor-pointer border bg-transparent px-[18px] py-2.5 font-sans text-[13px] disabled:opacity-50"
            >
              Yayından kaldır
            </button>
          </>
        ) : (
          <>
            <button
              disabled={pending}
              onClick={() => run(() => publishFeedback(draft.report.id, content), 'Yayımlandı — yarışmacı artık görebilir.')}
              className="bg-gold cursor-pointer border-none px-6 py-3 font-sans text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {pending ? 'İşleniyor…' : 'Yarışmacıya Yayımla'}
            </button>
            <button
              disabled={pending}
              onClick={() => run(() => saveFeedbackDraft(draft.report.id, content), 'Taslak kaydedildi.')}
              className="border-ink/[.22] text-ink cursor-pointer border bg-transparent px-[18px] py-3 font-sans text-[13px] disabled:opacity-50"
            >
              Taslağı kaydet
            </button>
          </>
        )}
        <Link
          href={`/submissions/${draft.report.id}`}
          className="text-teal ml-auto text-[13px] no-underline"
        >
          Yarışmacının göreceği hali →
        </Link>
      </div>
    </div>
  );
}
