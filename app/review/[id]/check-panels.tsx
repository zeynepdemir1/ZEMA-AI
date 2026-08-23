'use client';

import { useState } from 'react';
import Link from 'next/link';
import { THRESHOLD_NOTE } from '@/lib/ai/config';
import type { CheckResultView } from '@/lib/reports/queries';

/**
 * Altı AI kontrolünün hakem ekranındaki gösterimi (PLAN.md §6).
 *
 * Tasarım ilkeleri:
 * - Karar rozeti asla açıklamasız durmaz. Sayısal kontrollerde eşik,
 *   yargı kontrollerinde "AI yargısı" notu rozetin yanında.
 * - Kanıt (rapordan alıntı) ile AI gerekçesi görsel olarak AYRI: alıntılar
 *   beyaz zemin + sol teal kenar, gerekçe düz metin.
 * - Tekrarlayan yapılar (bölüm listesi, kategori sıralaması) tek tip
 *   kompakt satır; uzun cümle yerine kısa madde.
 */

const VERDICT: Record<string, { label: string; text: string; border: string; dot: string }> = {
  pass: { label: 'UYGUN', text: 'text-success', border: 'border-success', dot: 'bg-success' },
  warn: { label: 'DİKKAT', text: 'text-gold', border: 'border-gold', dot: 'bg-gold' },
  fail: { label: 'UYGUN DEĞİL', text: 'text-danger', border: 'border-danger', dot: 'bg-danger' },
  insufficient_evidence: {
    label: 'KANIT YETERSİZ',
    text: 'text-ink/[.55]',
    border: 'border-ink/[.35]',
    dot: 'bg-ink/40',
  },
};

/** feedback_synthesis bir kapı değil — "uygun" demek yanlış olur. */
const VERDICT_OVERRIDE: Record<string, string> = { feedback_synthesis: 'HAZIR' };

const LABEL = 'font-mono text-[9.5px] tracking-[.14em] text-ink/[.42]';
const BODY = 'text-[12.5px] leading-[1.7] text-ink/[.78]';

/** Rapordan birebir alıntı — AI gerekçesinden görsel olarak ayrı. */
function Quote({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-teal border-ink/[.08] border border-l-2 bg-white px-3 py-2">
      <span className="text-ink text-[12.5px] leading-[1.65] italic">“{children}”</span>
    </div>
  );
}

/** Tek tip kompakt satır: durum rozeti + ad + kısa not. */
function Row({
  state,
  name,
  note,
}: {
  state: { text: string; border: string; label: string };
  name: string;
  note?: string;
}) {
  return (
    <div className="border-ink/[.06] flex items-baseline gap-3 border-b py-2 last:border-b-0">
      <span
        className={`w-[52px] shrink-0 border py-0.5 text-center font-mono text-[9px] tracking-[.08em] ${state.text} ${state.border}`}
      >
        {state.label}
      </span>
      <span className="text-ink flex-1 text-[12.5px] font-medium">{name}</span>
      {note && <span className="text-ink/[.5] max-w-[46%] text-right text-[11.5px]">{note}</span>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className={LABEL}>{title}</div>
      {children}
    </section>
  );
}

export function CheckPanels({
  checks,
  reportId,
}: {
  checks: CheckResultView[];
  reportId: string;
}) {
  const firstProblem =
    checks.find((c) => c.verdict === 'fail')?.type ??
    checks.find((c) => c.verdict === 'warn')?.type ??
    checks.find((c) => c.verdict === 'insufficient_evidence')?.type ??
    null;
  const [open, setOpen] = useState<string | null>(firstProblem);

  if (checks.length === 0) {
    return (
      <div className="border-ink/[.22] text-ink/60 border border-dashed bg-white px-6 py-6 text-center text-[13px]">
        Analiz kuyruğu henüz sonuç üretmedi.
      </div>
    );
  }

  return (
    <div className="border-ink/10 border bg-white">
      <div className="border-ink/10 flex flex-wrap items-center justify-between gap-3 border-b px-7 py-3.5">
        <span className={LABEL}>AI KONTROLLERİ · {checks.length}/6</span>
        <span className="text-ink/[.42] font-mono text-[9.5px]">{THRESHOLD_NOTE}</span>
      </div>

      {checks.map((c) => {
        const v = VERDICT[c.verdict] ?? VERDICT.insufficient_evidence;
        const badge = VERDICT_OVERRIDE[c.type] ?? v.label;
        const isOpen = open === c.type;
        const why =
          c.scoring === 'numeric'
            ? `Uyum skoru %${Math.round(c.score ?? 0)} · eşik: ${THRESHOLD_NOTE}`
            : 'Modelin kendi yargısı — sayısal uyum skoru üretilmez';

        return (
          <div key={c.type} className="border-ink/[.07] border-b last:border-b-0">
            <button
              onClick={() => setOpen(isOpen ? null : c.type)}
              className="flex w-full cursor-pointer items-center gap-3.5 border-none bg-transparent px-7 py-3.5 text-left"
            >
              <span className="text-ink/[.3] w-2 font-mono text-[10px]">{isOpen ? '▾' : '▸'}</span>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${v.dot}`} />
              <span className="text-ink flex-1 text-[13.5px] font-medium">{c.label}</span>

              {c.scoring === 'numeric' && c.score !== null && (
                <span className="text-ink/[.55] font-mono text-[12px]">
                  %{Math.round(c.score)}
                </span>
              )}

              <span
                title={why}
                className={`shrink-0 border px-2 py-0.5 font-mono text-[9px] tracking-[.1em] ${v.text} ${v.border}`}
              >
                {badge}
              </span>
            </button>

            {isOpen && (
              <div className="bg-canvas border-ink/[.07] border-t px-7 pt-5 pb-6">
                <div className="flex flex-col gap-6">
                  <CheckDetail check={c} reportId={reportId} />
                </div>
                <div className="border-ink/[.07] text-ink/[.35] mt-6 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 font-mono text-[9.5px]">
                  <span>karar gerekçesi: {why}</span>
                  <span>model: {c.model}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CheckDetail({ check, reportId }: { check: CheckResultView; reportId: string }) {
  const p = check.payload;

  // ── Dil ve şablon ──
  if (check.type === 'language_template') {
    const sections = (p.sections ?? []) as Array<{
      name: string;
      present: boolean;
      substantive: boolean;
      note: string;
    }>;
    const issues = (p.language_issues ?? []) as Array<{
      quote: string;
      issue_type: string;
      severity: string;
      suggestion: string;
    }>;
    const spelling = issues.filter((i) => i.issue_type === 'imla');
    const other = issues.filter((i) => i.issue_type !== 'imla');
    const state = (s: (typeof sections)[number]) =>
      s.present && s.substantive
        ? { label: 'TAM', text: 'text-success', border: 'border-success' }
        : s.present
          ? { label: 'BOŞ', text: 'text-gold', border: 'border-gold' }
          : { label: 'YOK', text: 'text-danger', border: 'border-danger' };

    return (
      <>
        <Block title={`ZORUNLU BÖLÜMLER · ${sections.length}`}>
          <div>
            {sections.map((s) => (
              <Row
                key={s.name}
                state={state(s)}
                name={s.name}
                // Uzun cümle yerine kısa not.
                note={s.note ? s.note.split(/[.;]/)[0].trim().slice(0, 64) : undefined}
              />
            ))}
          </div>
        </Block>

        {spelling.length > 0 && (
          <Block title={`YAZIM HATALARI · ${spelling.length}`}>
            <div className="flex flex-col gap-2.5">
              {spelling.map((i, k) => (
                <div key={k} className="flex flex-col gap-1.5">
                  <Quote>{i.quote}</Quote>
                  <div className="text-teal-ink pl-3 text-[12px]">→ {i.suggestion}</div>
                </div>
              ))}
            </div>
          </Block>
        )}

        {other.length > 0 && (
          <Block title={`ANLATIM VE TERMİNOLOJİ · ${other.length}`}>
            <div className="flex flex-col gap-2.5">
              {other.map((i, k) => (
                <div key={k} className="flex flex-col gap-1.5">
                  <div className={LABEL}>
                    {i.issue_type.toLocaleUpperCase('tr-TR')} · {i.severity}
                  </div>
                  <Quote>{i.quote}</Quote>
                  <div className="text-teal-ink pl-3 text-[12px]">→ {i.suggestion}</div>
                </div>
              ))}
            </div>
          </Block>
        )}

        {issues.length === 0 && (
          <div className={BODY}>Dil kalitesinde raporlanacak bir sorun bulunmadı.</div>
        )}
      </>
    );
  }

  // ── Başlık-içerik (5. madde: detayda yüzde YOK) ──
  if (check.type === 'title_content') {
    const promises = (p.title_promises ?? []) as string[];
    const unmet = (p.unmet_promises ?? []) as Array<{ promise: string; why: string }>;
    const extra = (p.content_not_in_title ?? []) as string[];
    const suggested = (p.suggested_titles ?? []) as string[];
    return (
      <>
        {promises.length > 0 && (
          <Block title="BAŞLIĞIN VAAT ETTİKLERİ">
            <div>
              {promises.map((t, k) => (
                <Row
                  key={k}
                  state={
                    unmet.some((u) => u.promise === t)
                      ? { label: 'YOK', text: 'text-danger', border: 'border-danger' }
                      : { label: 'VAR', text: 'text-success', border: 'border-success' }
                  }
                  name={t}
                />
              ))}
            </div>
          </Block>
        )}

        {unmet.length > 0 && (
          <Block title={`KARŞILANMAYAN VAATLER · ${unmet.length}`}>
            <div className="flex flex-col gap-3">
              {unmet.map((u, k) => (
                <div key={k} className="flex flex-col gap-1">
                  <div className="text-ink text-[12.5px] font-medium">{u.promise}</div>
                  <div className={BODY}>{u.why}</div>
                </div>
              ))}
            </div>
          </Block>
        )}

        {extra.length > 0 && (
          <Block title="İÇERİKTE VAR, BAŞLIKTA YOK">
            <div className={BODY}>{extra.join(' · ')}</div>
          </Block>
        )}

        {suggested.length > 0 && (
          <Block title="ÖNERİLEN BAŞLIKLAR">
            <div className="flex flex-col gap-1.5">
              {suggested.map((t, k) => (
                <div key={k} className="text-teal-ink text-[12.5px]">
                  {t}
                </div>
              ))}
            </div>
          </Block>
        )}
      </>
    );
  }

  // ── Kategori uygunluğu ──
  if (check.type === 'category_fit') {
    const ranked = (p.ranked_categories ?? []) as Array<{
      category_id: string;
      category_name?: string;
      confidence: number;
      rationale: string;
    }>;
    return (
      <>
        <Block title="AI SINIFLANDIRMASI">
          <div>
            {ranked.map((r, k) => (
              <Row
                key={k}
                state={
                  k === 0
                    ? { label: 'EN OLASI', text: 'text-teal', border: 'border-teal' }
                    : { label: `%${(r.confidence * 100).toFixed(0)}`, text: 'text-ink/[.5]', border: 'border-ink/[.2]' }
                }
                name={r.category_name ?? r.category_id.slice(0, 8)}
                note={r.rationale.split(/[.;]/)[0].trim().slice(0, 70)}
              />
            ))}
          </div>
          <div className="text-ink/[.5] text-[11.5px]">
            Beyan edilen kategoriye güven: {String(p.declared_category_confidence ?? '—')}
            {p.is_mismatch === true && ' · beyan ile içerik uyuşmuyor'}
          </div>
        </Block>

        {p.recommendation ? (
          <Block title="HAKEME ÖNERİ">
            <div className={BODY}>{String(p.recommendation)}</div>
          </Block>
        ) : null}
      </>
    );
  }

  // ── Benzerlik ──
  if (check.type === 'similarity') {
    const passages = (p.matched_passages ?? []) as unknown[];
    const score = Number(p.semantic_score ?? 0);
    return (
      <>
        <Block title="ÖLÇÜM">
          <div>
            <Row
              state={{ label: `%${score}`, text: 'text-ink', border: 'border-ink/[.25]' }}
              name="Metin benzerliği"
              note={`${passages.length} eşleşen pasaj`}
            />
            <Row
              state={{ label: 'TÜR', text: 'text-ink/[.5]', border: 'border-ink/[.2]' }}
              name={String(p.overlap_type ?? '—').replace(/_/g, ' ')}
            />
          </div>
          <div className="text-ink/[.5] text-[11.5px]">
            Bu yüzde gerçek bir ölçüm; uyum skoru değil, o yüzden eşiğe vurulmaz.
          </div>
        </Block>

        {p.assessment ? (
          <Block title="AI DEĞERLENDİRMESİ">
            <div className={BODY}>{String(p.assessment)}</div>
          </Block>
        ) : null}

        {passages.length > 0 && (
          <Link
            href={`/review/${reportId}/similarity`}
            className="text-teal text-[12.5px] no-underline"
          >
            Yan yana karşılaştırmayı aç →
          </Link>
        )}
      </>
    );
  }

  // ── Kriter puanlaması ──
  if (check.type === 'criteria_scoring') {
    const criteria = (p.criteria ?? []) as Array<{ status: string }>;
    const stats = (p.evidence_stats ?? {}) as {
      totalQuotes?: number;
      exactQuotes?: number;
      diacriticsQuotes?: number;
    };
    const counts = criteria.reduce<Record<string, number>>((a, c) => {
      a[c.status] = (a[c.status] ?? 0) + 1;
      return a;
    }, {});
    return (
      <>
        <Block title={`KRİTER DAĞILIMI · ${criteria.length}`}>
          <div>
            <Row
              state={{ label: String(counts.done ?? 0), text: 'text-success', border: 'border-success' }}
              name="Yapıldı"
            />
            <Row
              state={{ label: String(counts.partial ?? 0), text: 'text-gold', border: 'border-gold' }}
              name="Kısmen"
            />
            <Row
              state={{ label: String(counts.not_done ?? 0), text: 'text-danger', border: 'border-danger' }}
              name="Yapılmadı"
            />
          </div>
        </Block>

        <Block title="KANIT DOĞRULAMA">
          <div className={BODY}>
            {stats.exactQuotes ?? 0}/{stats.totalQuotes ?? 0} alıntı rapor metninde birebir bulundu
            {stats.diacriticsQuotes ? ` · ${stats.diacriticsQuotes} yazım farkı` : ''}.
          </div>
          <div className="text-ink/[.5] text-[11.5px]">
            Kriter kriter düzenleme ve onay aşağıdaki kartlarda.
          </div>
        </Block>

        {p.overall_note ? (
          <Block title="GENEL NOT">
            <div className={BODY}>{String(p.overall_note)}</div>
          </Block>
        ) : null}
      </>
    );
  }

  // ── Yarışmacı geri bildirimi ──
  if (check.type === 'feedback_synthesis') {
    const strengths = (p.strengths ?? []) as string[];
    const improvements = (p.improvements ?? []) as Array<{
      area: string;
      what: string;
      how: string;
      priority: string;
    }>;
    const steps = (p.next_steps ?? []) as string[];
    return (
      <>
        <div className="border-l-gold border-ink/[.08] border border-l-2 bg-white px-3 py-2 text-[12px] leading-[1.6]">
          Yarışmacıya gidecek <strong>taslak</strong>. Yayımlama yetkisi Değerlendirme
          Yöneticisindedir; onaylanmadan görünmez.
        </div>

        {p.summary ? <div className={BODY}>{String(p.summary)}</div> : null}

        {strengths.length > 0 && (
          <Block title={`GÜÇLÜ YÖNLER · ${strengths.length}`}>
            <div>
              {strengths.map((t, k) => (
                <Row
                  key={k}
                  state={{ label: '+', text: 'text-success', border: 'border-success' }}
                  name={t}
                />
              ))}
            </div>
          </Block>
        )}

        {improvements.length > 0 && (
          <Block title={`GELİŞTİRİLECEK ALANLAR · ${improvements.length}`}>
            <div className="flex flex-col gap-3">
              {improvements.map((i, k) => (
                <div key={k} className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-ink text-[12.5px] font-medium">{i.area}</span>
                    {i.priority === 'high' && (
                      <span className="text-danger font-mono text-[9px] tracking-[.1em]">
                        ÖNCELİKLİ
                      </span>
                    )}
                  </div>
                  <div className={BODY}>{i.what}</div>
                  <div className="text-teal-ink text-[12px]">→ {i.how}</div>
                </div>
              ))}
            </div>
          </Block>
        )}

        {steps.length > 0 && (
          <Block title="SONRAKİ ADIMLAR">
            <div>
              {steps.map((t, k) => (
                <Row
                  key={k}
                  state={{ label: String(k + 1), text: 'text-ink/[.5]', border: 'border-ink/[.2]' }}
                  name={t}
                />
              ))}
            </div>
          </Block>
        )}
      </>
    );
  }

  return <div className={BODY}>Bu kontrol için ayrıntılı gösterim tanımlanmadı.</div>;
}
