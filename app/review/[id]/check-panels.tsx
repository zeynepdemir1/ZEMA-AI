'use client';

import { useState } from 'react';
import Link from 'next/link';
import { THRESHOLD_NOTE } from '@/lib/ai/config';
import type { CheckResultView } from '@/lib/reports/queries';

/**
 * Altı AI kontrolünün hakem ekranındaki gösterimi (PLAN.md §6).
 *
 * OKUNABİLİRLİK KURALLARI — ölçülerek belirlendi, tahminle değil:
 *
 * 1. Gövde metni 14px / satır yüksekliği 1.7. Küçük punto yok.
 * 2. Ink Navy metin en az %75 alfa. Ölçüm: %50 → 2.98:1 (AA başarısız),
 *    %65 → 4.51:1 (sınırda), %75 → 6.15:1 (rahat geçer). Gri-üstü-gri yok.
 * 3. `text-gold-ink` METİN OLARAK KULLANILMAZ — tam opaklıkta 2.92:1, AA'yı
 *    geçemiyor. Metin için `text-gold-ink` (5.01:1). Aynı şekilde `text-teal-ink`
 *    4.26:1 sınırda kaldığı için metinde `text-teal-ink` (5.81:1).
 *    Gold/teal yalnızca KENARLIK ve zemin olarak kullanılıyor.
 * 4. Paragraf yerine madde listesi. Uzun blok metin okunmuyor.
 * 5. Kart içinde en fazla iki görsel kat: AI analizi (nötr) ve kanıt
 *    (sol teal kenarlık + hafif zemin, 12.7:1 kontrast). Hakemin
 *    düzenlenebilir metni üçüncü kat olarak kriter kartlarında.
 */

const VERDICT: Record<
  string,
  { label: string; text: string; border: string; dot: string }
> = {
  pass: { label: 'UYGUN', text: 'text-success', border: 'border-success', dot: 'bg-success' },
  // gold değil gold-ink: rozet metni küçük punto, AA şart.
  warn: { label: 'DİKKAT', text: 'text-gold-ink', border: 'border-gold', dot: 'bg-gold' },
  fail: { label: 'UYGUN DEĞİL', text: 'text-danger', border: 'border-danger', dot: 'bg-danger' },
  insufficient_evidence: {
    label: 'KANIT YETERSİZ',
    text: 'text-ink/75',
    border: 'border-ink/40',
    dot: 'bg-ink/50',
  },
};

/** feedback_synthesis bir kapı değil — "uygun" demek yanlış olur. */
const VERDICT_OVERRIDE: Record<string, string> = { feedback_synthesis: 'HAZIR' };

/** Bölüm etiketi: 11px, %75 alfa (6.15:1). 9px + %42 idi, okunmuyordu. */
const SECTION = 'font-mono text-[11px] tracking-[.1em] text-ink/75';
/** Gövde: 14px / 1.7, %85 alfa (8.4:1). */
const BODY = 'text-[14px] leading-[1.7] text-ink/85';
/** İkincil not: 13px, %75 alfa. Daha aşağısı AA'yı geçmiyor. */
const MUTED = 'text-[13px] leading-[1.6] text-ink/75';

/** Rapordan birebir alıntı — 12.7:1 kontrast, AI gerekçesinden ayrı kat. */
function Quote({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="border-l-teal border-ink/10 border border-l-[3px] bg-[rgba(76,133,119,.06)] px-4 py-3">
      <div className="text-ink text-[14px] leading-[1.7]">“{children}”</div>
      {note && <div className="text-teal-ink mt-2 text-[13px] leading-[1.6]">→ {note}</div>}
    </div>
  );
}

/** Madde listesi — paragraf yerine. */
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((t, k) => (
        <li key={k} className={`flex gap-2.5 ${BODY}`}>
          <span className="text-teal-ink mt-[2px] shrink-0 font-mono text-[13px]">·</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** Tek tip durum satırı: rozet + ad + kısa not. */
function StateRow({
  label,
  tone,
  name,
  note,
}: {
  label: string;
  tone: { text: string; border: string };
  name: string;
  note?: string;
}) {
  return (
    <div className="border-ink/10 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2.5 last:border-b-0">
      <span
        className={`min-w-[54px] shrink-0 border px-1.5 py-1 text-center font-mono text-[10px] tracking-[.08em] ${tone.text} ${tone.border}`}
      >
        {label}
      </span>
      <span className="text-ink flex-1 text-[14px] leading-[1.5] font-medium">{name}</span>
      {note && <span className={`${MUTED} basis-full sm:basis-auto sm:text-right`}>{note}</span>}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h4 className={`${SECTION} m-0`}>{title}</h4>
      {children}
    </section>
  );
}

const TONE = {
  ok: { text: 'text-success', border: 'border-success' },
  warn: { text: 'text-gold-ink', border: 'border-gold' },
  bad: { text: 'text-danger', border: 'border-danger' },
  neutral: { text: 'text-ink/75', border: 'border-ink/30' },
} as const;

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
      <div className="border-ink/30 text-ink/75 border border-dashed bg-white px-6 py-7 text-center text-[14px]">
        Analiz kuyruğu henüz sonuç üretmedi.
      </div>
    );
  }

  return (
    <div className="border-ink/15 border bg-white">
      <div className="border-ink/15 flex flex-wrap items-center justify-between gap-3 border-b px-7 py-4">
        <h3 className={`${SECTION} m-0`}>AI KONTROLLERİ · {checks.length}/6</h3>
        <span className="text-ink/75 font-mono text-[11px]">{THRESHOLD_NOTE}</span>
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
          <div key={c.type} className="border-ink/10 border-b last:border-b-0">
            <button
              onClick={() => setOpen(isOpen ? null : c.type)}
              aria-expanded={isOpen}
              className="flex w-full cursor-pointer items-center gap-4 border-none bg-transparent px-7 py-4 text-left"
            >
              <span className="text-ink/75 w-3 shrink-0 font-mono text-[12px]">
                {isOpen ? '▾' : '▸'}
              </span>
              <span className={`h-2 w-2 shrink-0 rounded-full ${v.dot}`} />
              <span className="text-ink flex-1 text-[15px] leading-[1.4] font-medium">
                {c.label}
              </span>
              {c.scoring === 'numeric' && c.score !== null && (
                <span className="text-ink/85 shrink-0 font-mono text-[14px]">
                  %{Math.round(c.score)}
                </span>
              )}
              <span
                title={why}
                className={`shrink-0 border px-2.5 py-1 font-mono text-[10px] tracking-[.1em] ${v.text} ${v.border}`}
              >
                {badge}
              </span>
            </button>

            {isOpen && (
              <div className="bg-canvas border-ink/10 border-t px-7 pt-6 pb-7">
                <div className="flex flex-col gap-7">
                  <CheckDetail check={c} reportId={reportId} />
                </div>
                <div className="border-ink/10 text-ink/75 mt-7 flex flex-wrap gap-x-6 gap-y-1 border-t pt-4 font-mono text-[11px]">
                  <span>karar: {why}</span>
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
    const missing = sections.filter((s) => !s.present);
    const empty = sections.filter((s) => s.present && !s.substantive);

    return (
      <>
        <Block title={`ZORUNLU BÖLÜMLER · ${sections.length - missing.length}/${sections.length} TAM`}>
          <div>
            {sections.map((s) => (
              <StateRow
                key={s.name}
                label={s.present && s.substantive ? 'TAM' : s.present ? 'BOŞ' : 'YOK'}
                tone={s.present && s.substantive ? TONE.ok : s.present ? TONE.warn : TONE.bad}
                name={s.name}
              />
            ))}
          </div>
          {(missing.length > 0 || empty.length > 0) && (
            <div className={MUTED}>
              {missing.length > 0 && `Eksik: ${missing.map((s) => s.name).join(', ')}. `}
              {empty.length > 0 && `Başlığı var ama içi boş: ${empty.map((s) => s.name).join(', ')}.`}
            </div>
          )}
        </Block>

        {spelling.length > 0 && (
          <Block title={`YAZIM HATALARI · ${spelling.length}`}>
            <div className="flex flex-col gap-3">
              {spelling.map((i, k) => (
                <Quote key={k} note={i.suggestion}>
                  {i.quote}
                </Quote>
              ))}
            </div>
          </Block>
        )}

        {other.length > 0 && (
          <Block title={`ANLATIM VE TERMİNOLOJİ · ${other.length}`}>
            <div className="flex flex-col gap-3">
              {other.map((i, k) => (
                <div key={k} className="flex flex-col gap-1.5">
                  <div className={`${SECTION} normal-case`}>
                    {i.issue_type.toLocaleUpperCase('tr-TR')} · {i.severity}
                  </div>
                  <Quote note={i.suggestion}>{i.quote}</Quote>
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

  // ── Başlık-içerik (detayda yüzde YOK) ──
  if (check.type === 'title_content') {
    const promises = (p.title_promises ?? []) as string[];
    const unmet = (p.unmet_promises ?? []) as Array<{ promise: string; why: string }>;
    const extra = (p.content_not_in_title ?? []) as string[];
    const suggested = (p.suggested_titles ?? []) as string[];
    const unmetSet = new Set(unmet.map((u) => u.promise));

    return (
      <>
        {promises.length > 0 && (
          <Block title="BAŞLIĞIN VAAT ETTİKLERİ">
            <div>
              {promises.map((t, k) => (
                <StateRow
                  key={k}
                  label={unmetSet.has(t) ? 'YOK' : 'VAR'}
                  tone={unmetSet.has(t) ? TONE.bad : TONE.ok}
                  name={t}
                />
              ))}
            </div>
          </Block>
        )}

        {unmet.length > 0 && (
          <Block title={`KARŞILANMAYAN VAATLER · ${unmet.length}`}>
            <div className="flex flex-col gap-4">
              {unmet.map((u, k) => (
                <div key={k} className="flex flex-col gap-1.5">
                  <div className="text-ink text-[14px] leading-[1.5] font-semibold">
                    {u.promise}
                  </div>
                  <div className={BODY}>{u.why}</div>
                </div>
              ))}
            </div>
          </Block>
        )}

        {extra.length > 0 && (
          <Block title="İÇERİKTE VAR, BAŞLIKTA YOK">
            <Bullets items={extra} />
          </Block>
        )}

        {suggested.length > 0 && (
          <Block title="ÖNERİLEN BAŞLIKLAR">
            <Bullets items={suggested} />
          </Block>
        )}
      </>
    );
  }

  // ── Kategori uygunluğu: TEK SORU, tek cevap ──
  if (check.type === 'category_fit') {
    const consistent = p.is_consistent === true;
    const quote = String(p.conflicting_quote ?? '').trim();
    const reason = String(p.reason ?? '');

    if (consistent) {
      return (
        <div className="flex items-start gap-3">
          <span className="text-success mt-[3px] shrink-0 font-mono text-[13px]">✓</span>
          <div className="flex flex-col gap-2">
            <div className="text-ink text-[15px] leading-[1.5] font-medium">
              Beyan edilen kategoriyle uyumlu
            </div>
            {reason && <div className={BODY}>{reason}</div>}
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="flex items-start gap-3">
          <span className="text-danger mt-[3px] shrink-0 font-mono text-[13px]">✕</span>
          <div className="text-ink text-[15px] leading-[1.5] font-medium">
            Beyan edilen kategoriyle çelişiyor
          </div>
        </div>
        {quote ? (
          <Quote note={reason}>{quote}</Quote>
        ) : (
          <div className={BODY}>
            Çelişki bildirildi ancak rapordan kanıt alıntısı verilmedi; bu sonuç
            <span className="font-mono"> kanıt yetersiz </span>
            olarak işaretlendi.
          </div>
        )}
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
            <StateRow
              label={`%${score}`}
              tone={TONE.neutral}
              name="Metin benzerliği"
              note={`${passages.length} eşleşen pasaj`}
            />
            <StateRow
              label="TÜR"
              tone={TONE.neutral}
              name={String(p.overlap_type ?? '—').replace(/_/g, ' ')}
            />
          </div>
          <div className={MUTED}>
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
            className="text-teal-ink text-[14px] no-underline"
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
    const n = (k: string) => criteria.filter((c) => c.status === k).length;
    return (
      <>
        <Block title={`KRİTER DAĞILIMI · ${criteria.length}`}>
          <div>
            <StateRow label={String(n('done'))} tone={TONE.ok} name="Yapıldı" />
            <StateRow label={String(n('partial'))} tone={TONE.warn} name="Kısmen" />
            <StateRow label={String(n('not_done'))} tone={TONE.bad} name="Yapılmadı" />
          </div>
        </Block>

        <Block title="KANIT DOĞRULAMA">
          <div className={BODY}>
            {stats.exactQuotes ?? 0}/{stats.totalQuotes ?? 0} alıntı rapor metninde birebir
            bulundu
            {stats.diacriticsQuotes ? ` · ${stats.diacriticsQuotes} yazım farkı` : ''}.
          </div>
          <div className={MUTED}>Kriter kriter düzenleme ve onay aşağıdaki kartlarda.</div>
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
        <div className="border-l-gold border-ink/10 border border-l-[3px] bg-[rgba(201,138,62,.07)] px-4 py-3">
          <div className="text-ink text-[14px] leading-[1.7]">
            Yarışmacıya gidecek <strong>taslak</strong>. Yayımlama yetkisi Değerlendirme
            Yöneticisindedir; onaylanmadan görünmez.
          </div>
        </div>

        {p.summary ? <div className={BODY}>{String(p.summary)}</div> : null}

        {strengths.length > 0 && (
          <Block title={`GÜÇLÜ YÖNLER · ${strengths.length}`}>
            <Bullets items={strengths} />
          </Block>
        )}

        {improvements.length > 0 && (
          <Block title={`GELİŞTİRİLECEK ALANLAR · ${improvements.length}`}>
            <div className="flex flex-col gap-4">
              {improvements.map((i, k) => (
                <div key={k} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-ink text-[14px] leading-[1.5] font-semibold">
                      {i.area}
                    </span>
                    {i.priority === 'high' && (
                      <span className="text-danger border-danger border px-1.5 py-0.5 font-mono text-[10px] tracking-[.08em]">
                        ÖNCELİKLİ
                      </span>
                    )}
                  </div>
                  <div className={BODY}>{i.what}</div>
                  <div className="text-teal-ink text-[14px] leading-[1.7]">→ {i.how}</div>
                </div>
              ))}
            </div>
          </Block>
        )}

        {steps.length > 0 && (
          <Block title="SONRAKİ ADIMLAR">
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {steps.map((t, k) => (
                <li key={k} className={`flex gap-2.5 ${BODY}`}>
                  <span className="text-teal-ink shrink-0 font-mono text-[13px]">{k + 1}.</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </Block>
        )}
      </>
    );
  }

  return <div className={BODY}>Bu kontrol için ayrıntılı gösterim tanımlanmadı.</div>;
}
