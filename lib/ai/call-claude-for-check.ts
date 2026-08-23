import type { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { anthropic } from './client';
import {
  MOCK_AI,
  EFFORT,
  PROMPT_VERSIONS,
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
 * Dönüş tipi bilinçli olarak analysis_results kolonlarıyla eşleştirildi
 * (PLAN.md §3): payload / model / prompt_version / usage.
 * Böylece job runner sonucu doğrudan insert edebilir.
 */
export type CheckResult<T> = {
  payload: T;
  model: string;
  promptVersion: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  } | null;
  /** true ise fixture'dan geldi, gerçek API çağrılmadı (PLAN.md §5.4) */
  mocked: boolean;
};

export type CallCheckOptions<S extends z.ZodType> = {
  checkType: CheckType;
  /**
   * PLAN.md §5.1 katman 1 — YARIŞMA BAZINDA SABİT.
   * Rubrik, şablon spec, kategori listesi, rol tanımı. system'e gider, cache'lenir.
   * ⚠️ Buraya tarih/saat veya sırasız JSON.stringify KOYMA — cache'i sessizce bozar.
   */
  competitionContext: string;
  /**
   * PLAN.md §5.1 katman 2 — RAPOR BAZINDA SABİT.
   * 5 kontrolde aynı metin gönderilir, o yüzden ayrı cache breakpoint'i alır.
   */
  reportText: string;
  /** PLAN.md §5.1 katman 3 — DEĞİŞKEN. Kontrole özel talimat, en sonda. */
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

/**
 * Her Claude çağrısının tek kapısı (PLAN.md §5.4).
 *
 * MOCK_AI=true  → gerçek API HİÇ çağrılmaz, lib/ai/fixtures/<check>.json döner.
 * MOCK_AI=false → gerçek Claude API çağrılır.
 *
 * Kural: hiçbir yerde doğrudan anthropic() çağırma, her zaman buradan geç.
 * Aksi halde MOCK_AI bayrağı baypas edilir ve geliştirme sırasında para gider.
 */
export async function callClaudeForCheck<S extends z.ZodType = z.ZodType<unknown>>(
  opts: CallCheckOptions<S>,
): Promise<CheckResult<z.output<S>>> {
  const { checkType, competitionContext, reportText, instruction, schema } = opts;
  const model = modelFor(checkType);
  const promptVersion = PROMPT_VERSIONS[checkType];

  // ─── MOCK YOLU (PLAN.md §5.4) ──────────────────────────────
  if (MOCK_AI) {
    const fixture = FIXTURES[checkType];
    // Şema verildiyse fixture'ı da doğrula: fixture şemadan saparsa
    // hatayı UI'da değil burada yakalamak istiyoruz.
    const payload = (schema ? schema.parse(fixture) : fixture) as z.output<S>;
    return {
      payload,
      model: `mock:${model}`,
      promptVersion,
      usage: null,
      mocked: true,
    };
  }

  // ─── GERÇEK API YOLU ───────────────────────────────────────
  // PLAN.md §5.1: cache prefix sırası tools → system → messages.
  // Sabit içerik önce, değişken talimat en sonda.
  if (!schema) {
    throw new Error(
      `callClaudeForCheck(${checkType}): MOCK_AI=false iken schema zorunlu — ` +
        'yapılandırılmış çıktı olmadan gerçek çağrı yapma (PLAN.md §4).',
    );
  }

  const response = await anthropic().messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: opts.effort ?? EFFORT[checkType],
      format: zodOutputFormat(schema),
    },
    system: [
      {
        type: 'text',
        text: competitionContext,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `<rapor>\n${reportText}\n</rapor>`,
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: instruction },
        ],
      },
    ],
  });

  // PLAN.md §5.3: refusal HTTP 200 döner, exception fırlatmaz.
  if (response.stop_reason === 'refusal') {
    throw new Error(
      `callClaudeForCheck(${checkType}): model reddetti — ` +
        `kategori: ${response.stop_details?.category ?? 'bilinmiyor'}`,
    );
  }

  if (response.parsed_output == null) {
    throw new Error(
      `callClaudeForCheck(${checkType}): yapılandırılmış çıktı ayrıştırılamadı ` +
        `(stop_reason: ${response.stop_reason}).`,
    );
  }

  return {
    payload: response.parsed_output as z.output<S>,
    model: response.model,
    promptVersion,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      // §5.1 doğrulama: bu değer tekrarlı çağrılarda 0 kalıyorsa prefix bozuluyor.
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    },
    mocked: false,
  };
}
