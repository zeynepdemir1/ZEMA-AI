import type { CheckResultView, CriterionCardData } from './queries';

/**
 * Hakemin onayladığı metinlerden yarışmacı geri bildirimi taslağı derler.
 *
 * Girdiler: dört kontrolün judge_note'u + kriterlerin final_text/ai_text'i.
 * Çıktı, feedback.content şemasıyla aynı yapıda — Değerlendirme Yöneticisi
 * ekranı bunu doğrudan yayımlayabiliyor.
 *
 * "Bu kriterde eksiklik tespit edilmedi." metinleri GÜÇLÜ YÖN sayılmaz,
 * çünkü yarışmacıya "eksik yok" demek bir övgü değil — o maddeler atlanır.
 */
export type CompiledFeedback = {
  summary: string;
  strengths: string[];
  improvements: Array<{ area: string; what: string; how: string; priority: string }>;
  next_steps: string[];
};

const NO_ISSUE_MARK = 'eksiklik tespit edilmedi';

export function compileFeedback(
  checks: CheckResultView[],
  cards: CriterionCardData[],
  synthesis: Record<string, unknown> | null,
): CompiledFeedback {
  const improvements: CompiledFeedback['improvements'] = [];
  const strengths: string[] = [];

  // Dört kontrolden gelen hakem metinleri
  for (const c of checks) {
    if (c.type === 'criteria_scoring' || c.type === 'feedback_synthesis') continue;
    const note = (c.judgeNote ?? c.suggestedNote).trim();
    if (!note) continue;
    if (note.toLocaleLowerCase('tr').includes(NO_ISSUE_MARK)) continue;
    improvements.push({
      area: c.label,
      what: note,
      how: '',
      priority: c.verdict === 'fail' ? 'high' : 'medium',
    });
  }

  // Kriter kartları
  for (const card of cards) {
    const text = card.text.trim();
    if (!text) continue;
    if (card.status === 'done') {
      strengths.push(`${card.title}: ${text}`);
    } else {
      improvements.push({
        area: `${card.code} · ${card.title}`,
        what: text,
        how: '',
        priority: card.status === 'missing' ? 'high' : 'medium',
      });
    }
  }

  const s = (synthesis ?? {}) as { summary?: string; next_steps?: string[] };
  return {
    summary: s.summary ?? '',
    strengths,
    improvements,
    next_steps: s.next_steps ?? [],
  };
}

