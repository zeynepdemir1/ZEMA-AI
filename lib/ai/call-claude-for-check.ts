import { ApiError, type ThinkingConfig } from '@google/genai';
import type { z } from 'zod';
import { genai } from './client';
import { geminiSchemaFromZod } from './gemini-schema';
import {
  EFFORT,
  MOCK_AI,
  PROMPT_VERSIONS,
  THINKING_LEVEL,
  modelFor,
  type CheckType,
  type Effort,
} from './config';

// Fixture'lar statik import — Turbopack bundle'a gömer, Vercel'de fs yolu sorunu olmaz.
import languageTemplate from './fixtures/language_template.json';
import titleContent from './fixtures/title_content.json';
import categoryFit from './fixtures/category_fit.json';
import similarity from './fixtures/similarity.json';
import criteriaScoring from './fixtures/criteria_scoring.json';
import feedbackSynthesis from './fixtures/feedback_synthesis.json';

const FIXTURES: Record<CheckType, unknown> = {
  language_template: languageTemplate,
  title_content: titleContent,
  category_fit: categoryFit,
  similarity: similarity,
  criteria_scoring: criteriaScoring,
  feedback_synthesis: feedbackSynthesis,
};

/**
 * Dönüş tipi analysis_results kolonlarıyla eşleştirildi (PLAN.md §3):
 * payload / model / prompt_version / usage.
 */
export type CheckResult<T> = {
  payload: T;
  model: string;
  promptVersion: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    /** Gemini'nin bağlam önbelleğinden okunan token sayısı (§5.1 karşılığı) */
    cached_input_tokens: number;
    /** Düşünme (thinking) token'ları — Gemini bunları ayrı raporluyor */
    thoughts_tokens: number;
    total_tokens: number;
  } | null;
  /** true ise fixture'dan geldi, gerçek API çağrılmadı (PLAN.md §5.4) */
  mocked: boolean;
};

export type CallCheckOptions<S extends z.ZodType> = {
  checkType: CheckType;
  /**
   * YARIŞMA BAZINDA SABİT — rubrik, şablon spec, kategori listesi, rol tanımı.
   * systemInstruction olarak gider.
   *
   * ⚠️ PLAN.md §5.1'deki cache_control breakpoint'leri Anthropic'e özgüydü ve
   * kaldırıldı. Gemini'de karşılığı: desteklenen modellerde örtük (implicit)
   * önbellek otomatik çalışır; açık önbellek için ai.caches.create() ile
   * CachedContent oluşturmak ve minimum token eşiğini aşmak gerekir.
   * Şimdilik örtük önbelleğe güveniliyor — usage.cached_input_tokens'ı izle.
   */
  competitionContext: string;
  /** RAPOR BAZINDA SABİT — 5 kontrolde aynı metin. */
  reportText: string;
  /** DEĞİŞKEN — kontrole özel talimat, en sonda. */
  instruction: string;
  /**
   * İlgili kontrolün Zod şeması (PLAN.md §4.1–4.6).
   * Şemalar henüz yazılmadı (Gün 3–4). Verilmezse doğrulama atlanır ve
   * fixture/yanıt olduğu gibi döner — iskelet aşamasında bilinçli esneklik.
   */
  schema?: S;
  /** EFFORT tablosundaki varsayılanı ezmek için */
  effort?: Effort;
};

/** Geliştirme sırasında şema uyarılarını kontrol başına bir kez yaz. */
const warned = new Set<string>();

/**
 * Her model çağrısının tek kapısı (PLAN.md §5.4).
 *
 * MOCK_AI=true  → gerçek API HİÇ çağrılmaz, lib/ai/fixtures/<check>.json döner.
 * MOCK_AI=false → Gemini API çağrılır.
 *
 * Kural: hiçbir yerde doğrudan genai() çağırma, her zaman buradan geç.
 * Aksi halde MOCK_AI bayrağı baypas edilir ve kota boşa gider.
 */
export async function callModelForCheck<S extends z.ZodType = z.ZodType<unknown>>(
  opts: CallCheckOptions<S>,
): Promise<CheckResult<z.output<S>>> {
  const { checkType, competitionContext, reportText, instruction, schema } = opts;
  const model = modelFor(checkType);
  const promptVersion = PROMPT_VERSIONS[checkType];

  // ─── MOCK YOLU (PLAN.md §5.4) — sağlayıcı değişikliğinden etkilenmedi ───
  if (MOCK_AI) {
    const fixture = FIXTURES[checkType];
    // Şema verildiyse fixture'ı da doğrula: fixture şemadan saparsa hatayı
    // UI'da değil burada yakalamak istiyoruz.
    const payload = (schema ? schema.parse(fixture) : fixture) as z.output<S>;
    return { payload, model: `mock:${model}`, promptVersion, usage: null, mocked: true };
  }

  // ─── GERÇEK API YOLU (Gemini) ───
  if (!schema) {
    throw new Error(
      `callModelForCheck(${checkType}): MOCK_AI=false iken schema zorunlu — ` +
        'yapılandırılmış çıktı olmadan gerçek çağrı yapma (PLAN.md §4).',
    );
  }

  const { schema: responseJsonSchema, notes } = geminiSchemaFromZod(schema);
  if (notes.length && !warned.has(checkType) && process.env.NODE_ENV !== 'production') {
    warned.add(checkType);
    console.warn(`[zema:ai] ${checkType} şeması Gemini'ye uyarlandı:\n  ${notes.join('\n  ')}`);
  }

  const thinkingConfig: ThinkingConfig = {
    thinkingLevel: THINKING_LEVEL[opts.effort ?? EFFORT[checkType]],
  };

  let response;
  try {
    response = await genai().models.generateContent({
      model,
      // Sabit içerik önce, değişken talimat en sonda — örtük önbelleğin
      // ortak öneki yakalayabilmesi için sıra korunuyor.
      contents: [
        {
          role: 'user',
          parts: [{ text: `<rapor>\n${reportText}\n</rapor>` }, { text: instruction }],
        },
      ],
      config: {
        systemInstruction: competitionContext,
        responseMimeType: 'application/json',
        responseJsonSchema,
        thinkingConfig,
      },
    });
  } catch (e) {
    // PLAN.md §5.3'ün Gemini karşılığı: en spesifikten genele.
    // 429 kota, 5xx geçici → job'u yeniden dene; 4xx (429 hariç) → kalıcı hata.
    if (e instanceof ApiError) {
      const retryable = e.status === 429 || e.status >= 500;
      throw new CheckCallError(
        `callModelForCheck(${checkType}): Gemini ${e.status} — ${e.message}`,
        { retryable, cause: e },
      );
    }
    // Ağ kopması vb. — yeniden denenebilir.
    throw new CheckCallError(`callModelForCheck(${checkType}): ağ hatası`, {
      retryable: true,
      cause: e,
    });
  }

  // Prompt seviyesinde engellenme (güvenlik filtresi) — exception fırlatmaz.
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    throw new CheckCallError(
      `callModelForCheck(${checkType}): istem engellendi — ${blockReason}`,
      { retryable: false },
    );
  }

  const candidate = response.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish && finish !== 'STOP') {
    // MAX_TOKENS → çıktı yarıda kesildi, JSON bozuk gelir; SAFETY/RECITATION →
    // model reddetti. İkisi de sessizce yutulmamalı (PLAN.md §5.3).
    throw new CheckCallError(
      `callModelForCheck(${checkType}): tamamlanmadı — finishReason: ${finish}`,
      { retryable: finish === 'MAX_TOKENS' },
    );
  }

  const text = response.text;
  if (!text) {
    throw new CheckCallError(`callModelForCheck(${checkType}): boş yanıt`, { retryable: true });
  }

  // Gemini responseJsonSchema ile JSON garanti eder ama doğrulamayı yine de
  // Zod yapar — şema alt kümesine çevirirken kaybolan kısıtlar (pattern,
  // minLength, exclusiveMinimum) ancak burada yakalanır.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CheckCallError(
      `callModelForCheck(${checkType}): yanıt geçerli JSON değil`,
      { retryable: true },
    );
  }

  const payload = schema.parse(parsed) as z.output<S>;
  const u = response.usageMetadata;

  return {
    payload,
    model: response.modelVersion ?? model,
    promptVersion,
    usage: {
      input_tokens: u?.promptTokenCount ?? 0,
      output_tokens: u?.candidatesTokenCount ?? 0,
      cached_input_tokens: u?.cachedContentTokenCount ?? 0,
      thoughts_tokens: u?.thoughtsTokenCount ?? 0,
      total_tokens: u?.totalTokenCount ?? 0,
    },
    mocked: false,
  };
}

/**
 * Job runner'ın yeniden deneme kararını verebilmesi için hataya `retryable`
 * bilgisi eklenir (PLAN.md §2.1: attempts sayacı + 3 denemeden sonra failed).
 */
export class CheckCallError extends Error {
  readonly retryable: boolean;
  constructor(message: string, opts: { retryable: boolean; cause?: unknown }) {
    super(message, { cause: opts.cause });
    this.name = 'CheckCallError';
    this.retryable = opts.retryable;
  }
}
