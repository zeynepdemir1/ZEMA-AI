import { z } from 'zod';
import type { CheckType } from './config';

/**
 * PLAN.md §1: "Model kanıt gösteremediğinde `insufficient_evidence` döner,
 * uydurmaz." Bu, ürünün halüsinasyona karşı verdiği sözün şema karşılığı.
 *
 * `analysis_results.verdict` kolonu (text) bu dört değeri kabul ediyor —
 * migration gerekmiyor, eksik olan yalnızca Zod tarafıydı.
 *
 * ⚠️ Kriter seviyesinde bu değer YOK: `ai_criterion_scores.status` bir Postgres
 * enum'u ('done','partial','not_done') ve tasarımda tam üç rozet var. Bir kriter
 * için kanıt gösterilemediği, boş `evidence_quotes` + düşürülmüş `confidence`
 * ile ifade edilir (§4.5). `insufficient_evidence` kontrol seviyesine aittir.
 */
export const VerdictSchema = z.enum(['pass', 'warn', 'fail', 'insufficient_evidence']);
export type Verdict = z.infer<typeof VerdictSchema>;

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
  verdict: VerdictSchema,
});

// §4.2 — Başlık-içerik tutarlılığı
export const TitleContentSchema = z.object({
  alignment_score: z.number().min(0).max(100),
  title_promises: z.array(z.string()),
  unmet_promises: z.array(z.object({ promise: z.string(), why: z.string() })),
  content_not_in_title: z.array(z.string()),
  suggested_titles: z.array(z.string()).max(3),
  verdict: VerdictSchema,
});

// §4.3 — Kategori uygunluğu
/**
 * Takım ZATEN bir kategoride yarışıyor; bu bilgi sabittir. Kontrol tek bir
 * soruya cevap verir: rapor içeriği o kategoriyle ÇELİŞİYOR mu?
 *
 * Önceki şemada "en olası kategoriler" listesi vardı (ranked_categories,
 * declared_category_confidence). Kaldırıldı: hakemin diğer kategorilerin
 * yüzdesini görmesi karar vermesine yardımcı olmuyor, ekranı dolduruyor ve
 * "takım yanlış kategoride" izlenimi yaratıyor. Tek gereken şey çelişki
 * olup olmadığı ve varsa kanıtı.
 */
export const CategoryFitSchema = z.object({
  /** Rapor içeriği beyan edilen kategoriyle uyumlu mu? */
  is_consistent: z.boolean(),
  /**
   * Çelişki varsa rapordan BİREBİR alıntı; yoksa boş dize.
   * Kanıt doğrulaması bu alana da uygulanır — uydurulmuş alıntı yakalanır.
   */
  conflicting_quote: z.string(),
  /** Tek cümlelik gerekçe. Uyumluysa neden uyumlu, değilse neden değil. */
  reason: z.string(),
});

// §4.4 — Benzerlik / özgünlük (ikili karşılaştırma başına bir sonuç)
export const SimilarityPairSchema = z.object({
  // KAPSAM KESİNTİSİ: tablo/görsel benzerliği iptal (PDF'ten tablo/görsel
  // ayrıştırma ayrı bir çıkarım hattı gerektiriyordu — §4.4'ün açık sorusu).
  content_type: z.literal('metin'),
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

/** run-check.ts'in kanıt doğrulamasına geçirdiği yük tipi. */
export type CriteriaScoringPayload = z.output<typeof CriteriaScoringSchema>;
export type PayloadFor<K extends CheckType> = z.output<SchemaFor<K>>;

// ─────────────────────────────────────────────────────────────
// ŞABLON ÇIKARIMI (kontrol değil — yarışma kurulumu)
// ─────────────────────────────────────────────────────────────

/**
 * Yarışma Yöneticisi'nin yüklediği gerçek şablon PDF'inden çıkarılan spec.
 *
 * Şekil, `scripts/seed.ts`'teki elle yazılmış TEMPLATE_SPEC ile BİREBİR aynı
 * tutuldu: aynı alan `competitions.template_spec`'e yazılıyor ve
 * buildCompetitionContext tarafından JSON olarak prompt'a giriyor. Elle
 * girilen ile çıkarılan spec farklı şekilde olsaydı, aynı alanı okuyan
 * ekranlar ve promptlar iki farklı biçimle uğraşmak zorunda kalırdı.
 *
 * İki alan spec'in kendisine değil, ÇIKARIMIN GÜVENİLİRLİĞİNE dair:
 *
 * - `not_specified`: şablonda gerçekten yazmayan alanlar. Yapılandırılmış
 *   çıktı her alanı doldurmaya zorluyor; model uydurmak yerine buraya
 *   yazsın diye var. Boş string / 0 gördüğünde bu listeye bak.
 * - `source_quotes`: her çıkarımı doğrulayan, şablondan BİREBİR alıntı.
 *   verifyQuotes() ile metinde aranıyor — bulunamayan alıntı uydurmadır ve
 *   yöneticiye öyle gösteriliyor (PLAN.md §1 halüsinasyon kalkanı).
 */
export const TemplateSpecSchema = z.object({
  report_type: z.string(),
  language: z.string(),
  required_sections: z.array(z.string()),
  format: z.object({
    font: z.string(),
    page: z.string(),
    alignment: z.string(),
    max_pages: z.number().int(),
    footer: z.string(),
  }),
  content_rules: z.array(z.string()),
  citation_format: z.string(),
  not_specified: z.array(z.string()),
  source_quotes: z.array(
    z.object({
      /** Şablon metninden BİREBİR alıntı. */
      quote: z.string(),
      /** Bu alıntının hangi alanı gerekçelendirdiği (örn. "format.max_pages"). */
      section_ref: z.string(),
    }),
  ),
});

export type TemplateSpec = z.output<typeof TemplateSpecSchema>;
