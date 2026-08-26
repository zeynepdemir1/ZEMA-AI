import { ApiError, type Part, type ThinkingConfig } from '@google/genai';
import type { z } from 'zod';
import { genai, keyCount } from './client';
import {
  attemptPlan,
  describeAttempt,
  isInvalidKeyError,
  isKeyBlockedError,
  KEY_BLOCKED_MS,
  markExhausted,
  markKeyInvalid,
  poolStatus,
  retryAfterMs,
  SERVER_OVERLOAD_MS,
  type Attempt,
} from './key-pool';
import { geminiSchemaFromZod } from './gemini-schema';
import {
  EFFORT,
  MOCK_AI,
  PROMPT_VERSIONS,
  THINKING_LEVEL,
  modelChainFor,
  modelFor,
  type CheckType,
  type Effort,
} from './config';

// Fixture'lar statik import — Turbopack bundle'a gömer, Vercel'de fs yolu sorunu olmaz.
import requiredSections from './fixtures/required_sections.json';
import templateCompliance from './fixtures/template_compliance.json';
import languageCheck from './fixtures/language_check.json';
import titleContent from './fixtures/title_content.json';
import categoryFit from './fixtures/category_fit.json';
import similarity from './fixtures/similarity.json';
import criteriaScoring from './fixtures/criteria_scoring.json';
import feedbackSynthesis from './fixtures/feedback_synthesis.json';

const FIXTURES: Record<CheckType, unknown> = {
  required_sections: requiredSections,
  template_compliance: templateCompliance,
  language_check: languageCheck,
  title_content: titleContent,
  category_fit: categoryFit,
  similarity: similarity,
  criteria_scoring: criteriaScoring,
  feedback_synthesis: feedbackSynthesis,
};

/** Tek bir generateContent denemesi için üst sınır — aşılırsa sıradaki model/anahtara geçilir. */
const REQUEST_TIMEOUT_MS = 100_000;

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
  /**
   * ÇOK-MODLU GİRDİ — PDF'lerin kendisi.
   *
   * Verildiğinde metinden ÖNCE gönderilir (Gemini medyayı istem metninden
   * önce görmeyi tercih ediyor). Metin de gönderilmeye devam eder: kanıt
   * doğrulaması alıntıları extracted_text içinde arıyor, yalnızca görsel
   * katmandan okunan alıntılar boşluk/ligatür farkı yüzünden birebir
   * eşleşmez ve doğru alıntılar "uydurma" damgası yerdi.
   */
  pdfs?: ReadonlyArray<{ label: string; bytes: Uint8Array }>;
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

  const pdfParts: Part[] = (opts.pdfs ?? []).flatMap((f) => [
    { text: `<pdf label="${f.label}">` },
    { inlineData: { mimeType: 'application/pdf', data: Buffer.from(f.bytes).toString('base64') } },
    { text: '</pdf>' },
  ]);

  return callModel({
    label: checkType,
    models: modelChainFor(checkType),
    systemInstruction: competitionContext,
    // Sıra: PDF → metin → talimat. Sabit içerik önce, değişken talimat en
    // sonda; örtük önbelleğin ortak öneki yakalayabilmesi için korunuyor.
    parts: [...pdfParts, { text: `<rapor>\n${reportText}\n</rapor>` }, { text: instruction }],
    schema,
    effort: opts.effort ?? EFFORT[checkType],
    promptVersion: PROMPT_VERSIONS[checkType],
    mockPayload: FIXTURES[checkType],
    mockModel: modelFor(checkType),
  });
}

export type ModelCallOptions<S extends z.ZodType> = {
  /** Log ve hata mesajlarında görünen ad (kontrol adı, "template_spec", …) */
  label: string;
  /** Denenecek model sırası; her model havuzdaki her anahtarla denenir. */
  models: string[];
  systemInstruction: string;
  /** İstek gövdesi. Metin, satır içi PDF veya görüntü parçaları olabilir. */
  parts: Part[];
  schema?: S;
  effort: Effort;
  promptVersion: string;
  /** MOCK_AI=true iken dönecek sabit içerik. */
  mockPayload: unknown;
  /** Mock dönüşünde `mock:<model>` olarak raporlanacak model. */
  mockModel: string;
};

/**
 * HER MODEL ÇAĞRISININ TEK KAPISI (PLAN.md §5.4).
 *
 * MOCK_AI=true  → gerçek API HİÇ çağrılmaz, verilen mockPayload döner.
 * MOCK_AI=false → Gemini çağrılır; model × anahtar zinciri boyunca denenir.
 *
 * Kural: hiçbir yerde doğrudan genai() çağırma, her zaman buradan geç.
 * Aksi halde MOCK_AI bayrağı baypas edilir ve kota boşa gider.
 *
 * `parts` dışarıdan geliyor: aynı kapı hem düz metin kontrollerini hem
 * doğrudan PDF gönderen çok-modlu çağrıları taşıyor.
 */
export async function callModel<S extends z.ZodType = z.ZodType<unknown>>(
  opts: ModelCallOptions<S>,
): Promise<CheckResult<z.output<S>>> {
  const { label, models, systemInstruction, parts, schema, promptVersion } = opts;

  // ─── MOCK YOLU (PLAN.md §5.4) ───
  if (MOCK_AI) {
    // Şema verildiyse fixture'ı da doğrula: fixture şemadan saparsa hatayı
    // UI'da değil burada yakalamak istiyoruz.
    const payload = (schema ? schema.parse(opts.mockPayload) : opts.mockPayload) as z.output<S>;
    return {
      payload,
      model: `mock:${opts.mockModel}`,
      promptVersion,
      usage: null,
      mocked: true,
    };
  }

  // ─── GERÇEK API YOLU (Gemini) ───
  if (!schema) {
    throw new Error(
      `callModel(${label}): MOCK_AI=false iken schema zorunlu — ` +
        'yapılandırılmış çıktı olmadan gerçek çağrı yapma (PLAN.md §4).',
    );
  }

  const { schema: responseJsonSchema, notes } = geminiSchemaFromZod(schema);
  if (notes.length && !warned.has(label) && process.env.NODE_ENV !== 'production') {
    warned.add(label);
    console.warn(`[zema:ai] ${label} şeması Gemini'ye uyarlandı:\n  ${notes.join('\n  ')}`);
  }

  const thinkingConfig: ThinkingConfig = { thinkingLevel: THINKING_LEVEL[opts.effort] };

  const plan = attemptPlan(models);
  let response: Awaited<ReturnType<ReturnType<typeof genai>['models']['generateContent']>> | undefined;
  let lastError: unknown = null;
  let servedBy = models[0];

  for (let i = 0; i < plan.length; i++) {
    const attempt = plan[i];
    try {
      response = await callOnce(attempt);
      servedBy = attempt.model;
      if (i > 0 && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[zema:ai] ${label}: ${i} deneme başarısız → ${describeAttempt(attempt)} ile yanıt alındı.`,
        );
      }
      break;
    } catch (e) {
      lastError = e;
      const status = e instanceof ApiError ? e.status : undefined;

      // Kota doldu → bu (model, anahtar) çiftini soğumaya al ki sıradaki
      // çağrılar aynı doomed isteği tekrarlamasın.
      if (status === 429) markExhausted(attempt, retryAfterMs(e));
      // Anahtarın kendisi bozuk → o anahtarı tüm modeller için ele. Yoksa
      // .env'e yanlış yapıştırılmış tek bir anahtar bütün zinciri 400 ile
      // düşürürdü (400 normalde fallthrough etmez, etmemeli de: şema hatası
      // her modelde tekrarlanır, boşuna kota harcanmasın).
      const badKey = isInvalidKeyError(e);
      if (badKey) {
        markKeyInvalid(attempt.keyIndex, models);
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[zema:ai] ${describeAttempt(attempt)} reddedildi (geçersiz anahtar) — atlanıyor.`);
        }
      }

      // 403: anahtar geçerli ama bu anahtarla erişilemiyor (projede API
      // etkin değil, anahtar kısıtlı, faturalandırma engeli). ANAHTARA özgü,
      // başka anahtarla aynı istek çalışır — bu yüzden zinciri kesmemeli.
      // KISA soğuma: yeni etkinleştirilmiş bir projede 403 birkaç dakika
      // sürüp kendiliğinden geçiyor, anahtarı bir yıllığına elemek yanlış.
      const keyBlocked = !badKey && isKeyBlockedError(e);
      if (keyBlocked) {
        markKeyInvalid(attempt.keyIndex, models, KEY_BLOCKED_MS);
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[zema:ai] ${describeAttempt(attempt)} 403 verdi (projede API etkin değil ` +
              `veya anahtar kısıtlı) — ${Math.round(KEY_BLOCKED_MS / 60000)} dk atlanıyor.`,
          );
        }
      }

      // 5xx (aşırı yük, 504 DEADLINE_EXCEEDED dahil) VE ApiError olmayan
      // hatalar (zaman aşımı/ağ) da anahtara/modele özgü değil — sahada
      // template_compliance gibi ağır çok-modlu isteklerde 504 görüldü ve
      // eskiden zinciri olduğu yerde kesiyordu, oysa başka model/anahtar
      // aynı isteği tamamlayabiliyordu.
      const serverOverload = status !== undefined && status >= 500;
      if (serverOverload) markExhausted(attempt, SERVER_OVERLOAD_MS);
      const timedOutOrNetwork = !(e instanceof ApiError);
      const fallthrough =
        status === 429 || status === 404 || badKey || keyBlocked || serverOverload || timedOutOrNetwork;
      if (!fallthrough || i === plan.length - 1) break;
    }
  }

  if (!response) {
    const where = `${plan.length} deneme (${keyCount()} anahtar × ${models.length} model) · ${poolStatus(models)}`;
    if (lastError instanceof ApiError) {
      const retryable =
        lastError.status === 429 || lastError.status === 503 || lastError.status >= 500;
      throw new CheckCallError(
        `callModel(${label}): hiçbir model/anahtar bileşimi yanıt vermedi — ${where}. ` +
          `Son hata: ${lastError.status} — ${lastError.message}`,
        { retryable, cause: lastError },
      );
    }
    /**
     * ApiError DEĞİLSE altta yatan mesajı MUTLAKA taşı.
     *
     * Önceki sürüm yalnızca "ağ hatası" yazıyordu ve gerçek sebep (DNS,
     * TLS, soket zaman aşımı, SDK serileştirme hatası…) kayboluyordu.
     * Sahada bu yüzden 12 denemenin neden başarısız olduğu anlaşılamadı;
     * istem boyutu ölçülene kadar "belki çok büyük" diye zaman harcandı.
     */
    const detail =
      lastError instanceof Error
        ? `${lastError.name}: ${lastError.message}` +
          (lastError.cause instanceof Error ? ` ← ${lastError.cause.message}` : '')
        : String(lastError);
    throw new CheckCallError(`callModel(${label}): ağ hatası — ${where}. Sebep: ${detail}`, {
      retryable: true,
      cause: lastError,
    });
  }

  async function callOnce(attempt: Attempt) {
    return genai(attempt.keyIndex).models.generateContent({
      model: attempt.model,
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema,
        thinkingConfig,
        // Sahada görüldü: büyük çok-modlu istekte (rapor PDF'i + şablon metni,
        // template_compliance) SDK'nın altındaki istek 280s+ hiç yanıt vermeden
        // askıda kaldı — ne hata ne sonuç. AbortSignal/timeout yoksa bu tek
        // deneme sonsuza dek sürer ve model/anahtar zinciri hiç ilerlemez.
        httpOptions: { timeout: REQUEST_TIMEOUT_MS },
      },
    });
  }

  // Prompt seviyesinde engellenme (güvenlik filtresi) — exception fırlatmaz.
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    throw new CheckCallError(`callModel(${label}): istem engellendi — ${blockReason}`, {
      retryable: false,
    });
  }

  const candidate = response.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish && finish !== 'STOP') {
    // MAX_TOKENS → çıktı yarıda kesildi, JSON bozuk gelir; SAFETY/RECITATION →
    // model reddetti. İkisi de sessizce yutulmamalı (PLAN.md §5.3).
    throw new CheckCallError(`callModel(${label}): tamamlanmadı — finishReason: ${finish}`, {
      retryable: finish === 'MAX_TOKENS',
    });
  }

  const text = response.text;
  if (!text) {
    throw new CheckCallError(`callModel(${label}): boş yanıt`, { retryable: true });
  }

  // Gemini responseJsonSchema ile JSON garanti eder ama doğrulamayı yine de
  // Zod yapar — şema alt kümesine çevirirken kaybolan kısıtlar (pattern,
  // minLength, exclusiveMinimum) ancak burada yakalanır.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CheckCallError(`callModel(${label}): yanıt geçerli JSON değil`, { retryable: true });
  }

  const payload = schema.parse(parsed) as z.output<S>;
  const u = response.usageMetadata;

  return {
    payload,
    model: response.modelVersion ?? servedBy,
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
