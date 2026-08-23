import { z } from 'zod';
import type { CheckType } from './config';

/**
 * Altı kontrolün yapılandırılmış çıktı şemaları.
 * Kaynak: docs/PLAN.md §4.1–4.6 — birebir aktarıldı.
 *
 * Bunlar hem gerçek API yanıtını hem (şema geçildiğinde) fixture'ı doğrular.
 * Gemini'ye gönderilirken lib/ai/gemini-schema.ts alt kümeye çevirir.
 */

// §4.1 — Dil ve şablon kontrolü
export const LanguageTemplateSchema = z.object({
  language_detected: z.string(),
  is_expected_language: z.boolean(),
  sections: z.array(
    z.object({
      name: z.string(),
      present: z.boolean(),
      /** Başlık var ama altı boş mu — planın özellikle yakalamak istediği durum. */
      substantive: z.boolean(),
      note: z.string(),
    }),
  ),
  language_issues: z.array(
    z.object({
      /** Rapordan BİREBİR alıntı — kanıt doğrulaması buna bakar (§4.5). */
      quote: z.string(),
      issue_type: z.enum(['imla', 'anlatim', 'terminoloji', 'ton', 'tutarlilik']),
      severity: z.enum(['low', 'medium', 'high']),
      suggestion: z.string(),
    }),
  ),
  compliance_score: z.number().min(0).max(100),
  verdict: z.enum(['pass', 'warn', 'fail']),
});

// §4.2 — Başlık-içerik tutarlılığı
export const TitleContentSchema = z.object({
  alignment_score: z.number().min(0).max(100),
  title_promises: z.array(z.string()),
  unmet_promises: z.array(z.object({ promise: z.string(), why: z.string() })),
  content_not_in_title: z.array(z.string()),
  suggested_titles: z.array(z.string()).max(3),
  verdict: z.enum(['pass', 'warn', 'fail']),
});

// §4.3 — Kategori uygunluğu
export const CategoryFitSchema = z.object({
  ranked_categories: z
    .array(
      z.object({
        category_id: z.string(),
        confidence: z.number().min(0).max(1),
        rationale: z.string(),
      }),
    )
    .max(3),
  declared_category_confidence: z.number().min(0).max(1),
  is_mismatch: z.boolean(),
  recommendation: z.string(),
});

// §4.4 — Benzerlik / özgünlük (ikili karşılaştırma başına bir sonuç)
export const SimilarityPairSchema = z.object({
  content_type: z.enum(['metin', 'tablo', 'gorsel']),
  semantic_score: z.number().min(0).max(100),
  /** Ortak fikir mi ortak metin mi — planın ısrarla ayırdığı ayrım. */
  overlap_type: z.enum([
    'none',
    'ortak_alan_bilgisi',
    'benzer_yaklasim',
    'yakin_metin',
    'muhtemel_kopya',
  ]),
  matched_passages: z.array(
    z.object({
      a: z.string(),
      b: z.string(),
      note: z.string(),
      a_section_ref: z.string(),
      b_section_ref: z.string(),
    }),
  ),
  assessment: z.string(),
});

// §4.5 — Kriter bazlı yapılandırılmış geri bildirim (ANA ÖZELLİK)
export const CriteriaScoringSchema = z.object({
  criteria: z.array(
    z.object({
      criterion_id: z.string(),
      status: z.enum(['done', 'partial', 'not_done']),
      score: z.number(),
      confidence: z.number().min(0).max(1),
      /** Eksikler + nasıl düzeltilir, tek akıcı paragraf. */
      ai_text: z.string(),
      evidence_quotes: z
        .array(
          z.object({
            /** Rapordan BİREBİR — doğrulanamayan alıntı kırmızı rozet alır. */
            quote: z.string(),
            /** "Bölüm 3.2" gibi — hakemin hızlı doğrulaması için. */
            section_ref: z.string(),
          }),
        )
        .min(0)
        .max(3),
    }),
  ),
  overall_note: z.string(),
});

// §4.6 — Yarışmacı geri bildirimi (puan sızdırmaz)
export const FeedbackSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).min(2).max(5),
  improvements: z
    .array(
      z.object({
        area: z.string(),
        what: z.string(),
        /** Somut, uygulanabilir adım. */
        how: z.string(),
        priority: z.enum(['high', 'medium', 'low']),
      }),
    )
    .min(3)
    .max(7),
  next_steps: z.array(z.string()).max(4),
});

/** check_type → şema. Job runner bunu kullanarak doğru şemayı seçer. */
export const SCHEMAS = {
  language_template: LanguageTemplateSchema,
  title_content: TitleContentSchema,
  category_fit: CategoryFitSchema,
  similarity: SimilarityPairSchema,
  criteria_scoring: CriteriaScoringSchema,
  feedback_synthesis: FeedbackSchema,
} satisfies Record<CheckType, z.ZodType>;

export type SchemaFor<K extends CheckType> = (typeof SCHEMAS)[K];
export type PayloadFor<K extends CheckType> = z.output<SchemaFor<K>>;
