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

/**
 * BİÇİM KURALLARI — modelin çıktısı DEĞİL, PDF'ten ÖLÇÜM.
 *
 * Çok-modlu deneme sırasında model, ölçümle iki tarafa yaslı olduğu
 * kanıtlanmış bir belgeyi "sola hizalı" diye raporladı. Yazı tipi ve
 * hizalama piksel düzeyinde ölçüm isteyen özellikler; yanlış bir
 * "kurala uymuyor" bulgusu yarışmacıyı haksız yere cezalandırır.
 *
 * Bu yüzden bu alan `lib/reports/format-check.ts` tarafından ölçülüp
 * payload'a EKLENİYOR; modele sorulmuyor. Ölçüm MOCK_AI'dan bağımsız
 * çalışır — mock modda bile biçim bulguları gerçektir.
 */
export const FormatCheckSchema = z.object({
  /** İnsan tarafından okunur kural — şablondaki ifadeyle. */
  rule: z.string(),
  status: z.enum(['uygun', 'uygun_degil', 'degerlendirilemedi']),
  /** ÖLÇÜLEN değer, veya neden ölçülemediği. */
  evidence: z.string(),
  /** Bulgunun sayfası; sayfa bazlı değilse 0. */
  page: z.number().int(),
});

// §4.1 — Dil ve şablon kontrolü ÜÇE BÖLÜNDÜ (26 Ağustos, hakem geri bildirimi):
// tek bir "Dil ve Şablon Uyumu" kontrolü hem başlık varlığını, hem şablonun
// içerik beklentisini, hem de dil kalitesini karıştırıyordu. Artık üç ayrı
// kontrol — her biri kendi başlığı ve kendi hakem notu kutusuyla.

/** Zorunlu bölüm başlıklarının VARLIĞI — içerik derinliği burada değerlendirilmez. */
export const RequiredSectionsSchema = z.object({
  sections: z.array(
    z.object({
      name: z.string(),
      present: z.boolean(),
      /** Başlık var ama altı boş mu — planın özellikle yakalamak istediği durum. */
      substantive: z.boolean(),
      note: z.string(),
    }),
  ),
  compliance_score: z.number().min(0).max(100),
  verdict: VerdictSchema,
});

/**
 * Raporun İÇERİĞİNİN şablonun her bölüm için istediğiyle karşılaştırılması.
 *
 * NEDEN AYRI: yalnızca başlığın var olup olmadığını kontrol etmek yetersizdi
 * — şablon PDF'i çoğu zaman her başlığın altında "burada şunlar yer almalı"
 * diye ayrıntılı talimat verir, ama bu talimat `required_sections` (yalnızca
 * başlık adları) çıkarımında kaybolur. Bu kontrol run-check.ts'te şablonun
 * kendi metnini (varsa) referans olarak alıp raporla karşılaştırır.
 */
export const TemplateComplianceSchema = z.object({
  section_reviews: z.array(
    z.object({
      section: z.string(),
      /** Şablonun bu başlık altında ne istediğinin KISA özeti (şablon metninden okunan). */
      expected: z.string(),
      meets_expectation: z.boolean(),
      /** Karşılıyorsa raporu destekleyen BİREBİR alıntı; karşılamıyorsa boş dize. */
      quote: z.string(),
      note: z.string(),
    }),
  ),
  compliance_score: z.number().min(0).max(100),
  verdict: VerdictSchema,
});

/** Dil tespiti + Türkçe dil kalitesi — biçim ve içerik kontrolünden ayrı. */
export const LanguageCheckSchema = z.object({
  language_detected: z.string(),
  is_expected_language: z.boolean(),
  issues: z.array(
    z.object({
      /** Rapordan BİREBİR alıntı — kanıt doğrulaması buna bakar (§4.5). */
      quote: z.string(),
      /** Hatanın geçtiği PDF sayfa numarası; belirlenemiyorsa 0. */
      page: z.number().int(),
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
   * Kanıt doğrulaması bu alana UYGULANIR: alıntı rapor metninde
   * bulunamazsa karar `fail` değil `insufficient_evidence` olur
   * (deriveVerdict → makeVerifier, diyakritik toleranslı).
   */
  conflicting_quote: z.string(),
  /** Tek cümlelik gerekçe. Uyumluysa neden uyumlu, değilse neden değil. */
  reason: z.string(),
});

// §4.4 — Benzerlik / özgünlük (ikili karşılaştırma başına bir sonuç)
export const SimilarityPairSchema = z.object({
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
  /**
   * TABLO / GÖRSEL ÖRTÜŞMESİ — PDF çok-modlu olarak gönderildiğinde dolar.
   * §4.4'ün açık sorusuydu ve "kapsam dışı" bırakılmıştı; ayrı bir
   * tablo-çıkarım hattı yerine modelin görme yeteneği kullanılıyor.
   *
   * matched_passages'tan AYRI tutuluyor, çünkü buradaki `what` alanı
   * BİREBİR ALINTI DEĞİL, bir tarif — bir tablonun veya şeklin metin
   * karşılığı yok. Hakem sayfa numarasından açıp kendi gözüyle doğruluyor,
   * kanıt disiplini bozulmuyor.
   */
  matched_visuals: z.array(
    z.object({
      kind: z.enum(['tablo', 'gorsel']),
      /** Bu raporda hangi sayfa. */
      a_page: z.number().int(),
      /** Karşılaştırılan raporda hangi sayfa. */
      b_page: z.number().int(),
      /** Ne örtüşüyor — tarif, alıntı değil. */
      what: z.string(),
      /** Ortak kaynak mı, aynı şablon mu, kopya mı. */
      note: z.string(),
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
  required_sections: RequiredSectionsSchema,
  template_compliance: TemplateComplianceSchema,
  language_check: LanguageCheckSchema,
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
/**
 * Şablondan çıkarılan DEĞERLENDİRME KRİTERİ (rubrik satırı).
 *
 * `criteria` tablosunun alanlarıyla birebir eşleşiyor (bkz.
 * app/api/competitions/[id]/template/route.ts) — çıkarım sonucu doğrudan o
 * tabloya yazılabilsin diye kasıtlı.
 */
export const ExtractedCriterionSchema = z.object({
  /** Kısa kod, ör. "K1". Şablonda yoksa sırayla üret. */
  code: z.string(),
  name: z.string(),
  /** Hakemin ne aradığını anlatan, rapor değerlendirilirken kullanılacak beklenti metni. */
  description: z.string(),
  max_score: z.number(),
  /** 0-1 arası ağırlık oranı (toplamda 1'e yakın olmalı). */
  weight: z.number().min(0).max(1),
});
export type ExtractedCriterion = z.output<typeof ExtractedCriterionSchema>;

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
  /** Şablonda bulunan değerlendirme rubriği — boşsa şablonda rubrik yok demektir. */
  criteria: z.array(ExtractedCriterionSchema),
  not_specified: z.array(z.string()),
  source_quotes: z.array(
    z.object({
      /** Şablon metninden BİREBİR alıntı. */
      quote: z.string(),
      /** Bu alıntının hangi alanı gerekçelendirdiği (örn. "format.max_pages", "criteria[K1]"). */
      section_ref: z.string(),
    }),
  ),
});

export type TemplateSpec = z.output<typeof TemplateSpecSchema>;


// ─────────────────────────────────────────────────────────────
// ŞARTNAME ÇIKARIMI (yarışma kuralları belgesi)
// ─────────────────────────────────────────────────────────────

/**
 * Şartname = yarışmanın resmî kurallar belgesi.
 *
 * NEDEN AYRI BİR BELGE TÜRÜ: puanlama rubriği çoğu TEKNOFEST yarışmasında
 * rapor ŞABLONUNDA değil ŞARTNAMEDE bulunuyor. Sahada ölçüldü: gerçek bir
 * ÖTR şablonundan ve bir Model Uydu PDR şablonundan çıkarılan kriter
 * sayısı İKİSİNDE DE 0. Şablon "raporu nasıl yazacaksın"ı, şartname
 * "nasıl puanlanacaksın"ı anlatıyor; ikisi farklı belgeler.
 *
 * Bu şema `TemplateSpecSchema` ile bilinçli olarak ÖRTÜŞÜYOR ama aynı
 * değil: şartnamenin asıl katkısı `criteria`, şablonun asıl katkısı
 * `format` + `required_sections`. Hangi alanın hangi belgeden geldiği
 * `template_spec.sources` altında işaretleniyor.
 */
export const RulebookSpecSchema = z.object({
  /** Şartnamenin tanımladığı yarışma adı — yanlış belge yüklendiyse fark edilir. */
  competition_name: z.string(),
  /** ASIL KATKI: puanlama rubriği. */
  criteria: z.array(ExtractedCriterionSchema),
  /**
   * Şartnamede geçen, biçimle ilgili OLMAYAN ek kurallar (katılım koşulu,
   * teslim kuralı, diskalifiye sebebi…). `content_rules`'a eklenir.
   */
  extra_rules: z.array(z.string()),
  /** Şartnamede bulunamayan alanların adları — model uydurmasın. */
  not_specified: z.array(z.string()),
  /** Her çıkarımı gerekçelendiren BİREBİR alıntı; verifyQuotes ile aranır. */
  source_quotes: z.array(
    z.object({
      quote: z.string(),
      /** Gerekçelendirdiği alan: "criteria[K1]", "extra_rules", … */
      section_ref: z.string(),
    }),
  ),
});

export type RulebookSpec = z.output<typeof RulebookSpecSchema>;
