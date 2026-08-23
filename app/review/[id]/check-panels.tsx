'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CheckResultView } from '@/lib/reports/queries';

/**
 * Altı AI kontrolünün hakem ekranındaki gösterimi (PLAN.md §6:
 * "6 kontrolün sekmeleri").
 *
 * Şartnamenin altı gereksinimi burada görünür hale geliyor. Bu bileşen
 * eklenene kadar dört kontrol çalışıp sonucu hiç gösterilmiyordu.
 */

const VERDICT: Record<string, { label: string; tone: string; dot: string }> = {
  pass: { label: 'UYGUN', tone: 'text-success border-success', dot: 'bg-success' },
  warn: { label: 'DİKKAT', tone: 'text-gold border-gold', dot: 'bg-gold' },
  fail: { label: 'UYGUN DEĞİL', tone: 'text-danger border-danger', dot: 'bg-danger' },
  insufficient_evidence: {
    label: 'KANIT YETERSİZ',
    tone: 'text-ink/[.55] border-ink/[.35]',
    dot: 'bg-ink/40',
  },
};

const MONO_LABEL = 'text-ink/[.45] font-mono text-[10px] tracking-[.12em]';

export function CheckPanels({
  checks,
  reportId,
}: {
  checks: CheckResultView[];
  reportId: string;
}) {
  /**
   * Varsayılan olarak ilk SORUNLU kontrol açık gelir (önce fail, sonra warn,
   * sonra kanıt yetersiz). Hakemin dikkatini doğrudan bulguya çekiyor ve
   * ekran görüntüsünde de anlamlı bir içerik görünüyor.
   */
  const firstProblem =
    checks.find((c) => c.verdict === 'fail')?.type ??
    checks.find((c) => c.verdict === 'warn')?.type ??
    checks.find((c) => c.verdict === 'insufficient_evidence')?.type ??
    null;
  const [open, setOpen] = useState<string | null>(firstProblem);

  if (checks.length === 0) {
    return (
      <div className="border-ink/[.22] border border-dashed bg-white px-6 py-5 text-center">
        <div className="text-ink/60 text-[13.5px]">
          Analiz kuyruğu henüz sonuç üretmedi.
        </div>
      </div>
    );
  }

  return (
    <div className="border-ink/10 border bg-white">
      <div className="border-ink/10 flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <span className={MONO_LABEL}>AI KONTROLLERİ · {checks.length}/6</span>
        <span className="text-ink/[.45] font-mono text-[10px]">
          Her satır bir gereksinim — detay için tıklayın
        </span>
      </div>

      {checks.map((c) => {
        const v = VERDICT[c.verdict] ?? VERDICT.insufficient_evidence;
        const isOpen = open === c.type;
        return (
          <div key={c.type} className="border-ink/[.07] border-b last:border-b-0">
            <button
              onClick={() => setOpen(isOpen ? null : c.type)}
              className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-6 py-3 text-left"
            >
              <span className="text-ink/[.35] w-2.5 font-mono text-[10px]">
                {isOpen ? '▾' : '▸'}
              </span>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${v.dot}`} />
              <span className="text-ink flex-1 text-[13.5px] font-medium">{c.label}</span>
              {c.score !== null && (
                <span className="text-ink/[.45] font-mono text-[11px]">{Math.round(c.score)}</span>
              )}
              <span
                className={`border px-1.5 py-0.5 font-mono text-[9px] tracking-[.1em] ${v.tone}`}
              >
                {v.label}
              </span>
            </button>

            {isOpen && (
              <div className="bg-canvas border-ink/[.07] border-t px-6 py-4">
                <CheckDetail check={c} reportId={reportId} />
                <div className="text-ink/[.35] mt-3 font-mono text-[9.5px]">
                  model: {c.model}
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
    return (
      <div className="flex flex-col gap-4">
        <div className="text-ink/70 text-[13px]">
          Tespit edilen dil: <span className="font-mono">{String(p.language_detected ?? '—')}</span>
          {' · '}
          {p.is_expected_language ? 'beklenen dille uyumlu' : 'beklenen dilden farklı'}
        </div>

        <div>
          <div className={`${MONO_LABEL} mb-2`}>ZORUNLU BÖLÜMLER</div>
          <div className="flex flex-col gap-1">
            {sections.map((s) => (
              <div key={s.name} className="flex items-start gap-2 text-[12.5px]">
                <span
                  className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] tracking-[.08em] ${
                    s.present && s.substantive
                      ? 'text-success border-success'
                      : s.present
                        ? 'text-gold border-gold'
                        : 'text-danger border-danger'
                  }`}
                >
                  {s.present && s.substantive ? 'TAM' : s.present ? 'BOŞ' : 'YOK'}
                </span>
                <span className="text-ink font-medium">{s.name}</span>
                {s.note && <span className="text-ink/[.55]">— {s.note}</span>}
              </div>
            ))}
          </div>
        </div>

        {issues.length > 0 && (
          <div>
            <div className={`${MONO_LABEL} mb-2`}>DİL SORUNLARI · {issues.length}</div>
            <div className="flex flex-col gap-2">
              {issues.map((i, k) => (
                <div key={k} className="border-ink/[.12] border-l-2 pl-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="text-ink/[.45] font-mono text-[9.5px] tracking-[.08em]">
                      {i.issue_type.toLocaleUpperCase('tr-TR')} · {i.severity}
                    </span>
                  </div>
                  <div className="text-ink/70 mb-1 text-[12.5px] italic">“{i.quote}”</div>
                  <div className="text-ink text-[12.5px]">→ {i.suggestion}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (check.type === 'title_content') {
    const promises = (p.title_promises ?? []) as string[];
    const unmet = (p.unmet_promises ?? []) as Array<{ promise: string; why: string }>;
    const extra = (p.content_not_in_title ?? []) as string[];
    const suggested = (p.suggested_titles ?? []) as string[];
    return (
      <div className="flex flex-col gap-4">
        <div className="text-ink/70 text-[13px]">
          Uyum skoru: <span className="text-ink font-mono">{String(p.alignment_score ?? '—')}</span>
          /100
        </div>

        {promises.length > 0 && (
          <div>
            <div className={`${MONO_LABEL} mb-1.5`}>BAŞLIĞIN VAAT ETTİKLERİ</div>
            <ul className="text-ink/[.78] m-0 list-disc pl-5 text-[12.5px] leading-[1.7]">
              {promises.map((t, k) => (
                <li key={k}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {unmet.length > 0 && (
          <div>
            <div className={`${MONO_LABEL} mb-1.5`}>KARŞILANMAYAN VAATLER</div>
            <div className="flex flex-col gap-2">
              {unmet.map((u, k) => (
                <div key={k} className="border-danger border-l-2 pl-3">
                  <div className="text-ink text-[12.5px] font-medium">{u.promise}</div>
                  <div className="text-ink/70 text-[12.5px]">{u.why}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {extra.length > 0 && (
          <div>
            <div className={`${MONO_LABEL} mb-1.5`}>İÇERİKTE VAR, BAŞLIKTA YOK</div>
            <ul className="text-ink/[.78] m-0 list-disc pl-5 text-[12.5px] leading-[1.7]">
              {extra.map((t, k) => (
                <li key={k}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {suggested.length > 0 && (
          <div>
            <div className={`${MONO_LABEL} mb-1.5`}>ÖNERİLEN BAŞLIKLAR</div>
            <div className="flex flex-col gap-1">
              {suggested.map((t, k) => (
                <div key={k} className="text-teal-ink text-[12.5px]">
                  · {t}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (check.type === 'category_fit') {
    const ranked = (p.ranked_categories ?? []) as Array<{
      category_id: string;
      category_name?: string;
      confidence: number;
      rationale: string;
    }>;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span className="text-ink/70">
            Beyan edilen kategoriye güven:{' '}
            <span className="text-ink font-mono">
              {String(p.declared_category_confidence ?? '—')}
            </span>
          </span>
          {p.is_mismatch === true && (
            <span className="text-danger border-danger border px-2 py-0.5 font-mono text-[9.5px] tracking-[.1em]">
              KATEGORİ UYUŞMUYOR
            </span>
          )}
        </div>

        {ranked.length > 0 && (
          <div>
            <div className={`${MONO_LABEL} mb-2`}>AI SINIFLANDIRMASI · en olası kategoriler</div>
            <div className="flex flex-col gap-2">
              {ranked.map((r, k) => (
                <div key={k} className="border-ink/[.12] border-l-2 pl-3">
                  <div className="mb-0.5 flex items-baseline gap-2">
                    <span className="text-ink font-mono text-[12px]">
                      {(r.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-ink text-[12.5px] font-medium">
                      {r.category_name ?? r.category_id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="text-ink/70 text-[12.5px] leading-[1.55]">{r.rationale}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {p.recommendation ? (
          <div className="border-teal bg-[rgba(76,133,119,.07)] border-l-2 px-3 py-2">
            <div className="text-teal-ink mb-1 font-mono text-[9.5px] tracking-[.1em]">
              HAKEME ÖNERİ
            </div>
            <div className="text-ink text-[12.5px] leading-[1.6]">{String(p.recommendation)}</div>
          </div>
        ) : null}
      </div>
    );
  }

  if (check.type === 'similarity') {
    const passages = (p.matched_passages ?? []) as unknown[];
    return (
      <div className="flex flex-col gap-3">
        <div className="text-ink/70 text-[13px]">
          Örtüşme türü:{' '}
          <span className="text-ink font-mono">{String(p.overlap_type ?? '—')}</span> · benzerlik{' '}
          <span className="text-ink font-mono">{String(p.semantic_score ?? 0)}%</span> ·{' '}
          {passages.length} eşleşen pasaj
        </div>
        {p.assessment ? (
          <div className="text-ink/[.78] text-[12.5px] leading-[1.65]">
            {String(p.assessment)}
          </div>
        ) : null}
        <Link
          href={`/review/${reportId}/similarity`}
          className="text-teal text-[12.5px] no-underline"
        >
          Yan yana karşılaştırmayı aç →
        </Link>
      </div>
    );
  }

  if (check.type === 'criteria_scoring') {
    const criteria = (p.criteria ?? []) as unknown[];
    const stats = (p.evidence_stats ?? {}) as {
      totalQuotes?: number;
      exactQuotes?: number;
      diacriticsQuotes?: number;
    };
    return (
      <div className="flex flex-col gap-2 text-[12.5px]">
        <div className="text-ink/70">
          {criteria.length} kriter değerlendirildi. Kanıt doğrulaması:{' '}
          <span className="text-ink font-mono">
            {stats.exactQuotes ?? 0}/{stats.totalQuotes ?? 0}
          </span>{' '}
          alıntı birebir bulundu
          {stats.diacriticsQuotes ? ` · ${stats.diacriticsQuotes} yazım farkı` : ''}.
        </div>
        <div className="text-ink/[.55]">
          Kriter kriter değerlendirme aşağıdaki kartlarda — düzenleme ve onay orada yapılır.
        </div>
        {p.overall_note ? (
          <div className="border-ink/[.12] mt-1 border-l-2 pl-3 leading-[1.6]">
            {String(p.overall_note)}
          </div>
        ) : null}
      </div>
    );
  }

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
      <div className="flex flex-col gap-4">
        <div className="border-gold bg-[rgba(201,138,62,.07)] border-l-2 px-3 py-2 text-[12.5px] leading-[1.6]">
          Bu metin <strong>yarışmacıya gidecek taslak</strong>tır. Yayımlama yetkisi
          Değerlendirme Yöneticisindedir; onaylanmadan yarışmacıya görünmez.
        </div>
        {p.summary ? (
          <div className="text-ink/[.82] text-[12.5px] leading-[1.65]">{String(p.summary)}</div>
        ) : null}
        {strengths.length > 0 && (
          <div>
            <div className={`${MONO_LABEL} mb-1.5`}>GÜÇLÜ YÖNLER · {strengths.length}</div>
            <ul className="text-ink/[.78] m-0 list-disc pl-5 text-[12.5px] leading-[1.7]">
              {strengths.map((t, k) => (
                <li key={k}>{t}</li>
              ))}
            </ul>
          </div>
        )}
        {improvements.length > 0 && (
          <div>
            <div className={`${MONO_LABEL} mb-1.5`}>
              GELİŞTİRİLECEK ALANLAR · {improvements.length}
            </div>
            <div className="flex flex-col gap-2">
              {improvements.map((i, k) => (
                <div key={k} className="border-gold border-l-2 pl-3">
                  <div className="text-ink text-[12.5px] font-medium">
                    {i.area}
                    {i.priority === 'high' && (
                      <span className="text-danger ml-2 font-mono text-[9px] tracking-[.1em]">
                        ÖNCELİKLİ
                      </span>
                    )}
                  </div>
                  <div className="text-ink/70 text-[12.5px]">{i.what}</div>
                  <div className="text-ink/[.82] text-[12.5px]">→ {i.how}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {steps.length > 0 && (
          <div>
            <div className={`${MONO_LABEL} mb-1.5`}>SONRAKİ ADIMLAR</div>
            <ol className="text-ink/[.78] m-0 list-decimal pl-5 text-[12.5px] leading-[1.7]">
              {steps.map((t, k) => (
                <li key={k}>{t}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }

  return (
    <pre className="text-ink/70 overflow-x-auto text-[11px]">
      {JSON.stringify(p, null, 2).slice(0, 1200)}
    </pre>
  );
}
