/**
 * ZEMA — Claude API yapılandırması
 * Kaynak: PLAN.md §4 (ortak ilkeler), §5.1 (caching), §5.4 (mock mod)
 */

/** PLAN.md §3: check_type enum'u ile birebir aynı sırada ve isimde. */
export const CHECK_TYPES = [
  'language_template',
  'title_content',
  'category_fit',
  'similarity',
  'criteria_scoring',
  'feedback_synthesis',
] as const;

export type CheckType = (typeof CHECK_TYPES)[number];

/**
 * PLAN.md §4: bütçe kararı claude-sonnet-5.
 * §4 notu: "Bütçe/kalite dengesi değişirse criteria_scoring gibi en kritik
 * kontrol Opus'a yükseltilebilir, diğerleri Sonnet'te kalabilir."
 * Bunun için MODEL_OVERRIDES var — şimdilik boş.
 */
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

export const MODEL_OVERRIDES: Partial<Record<CheckType, string>> = {
  // criteria_scoring: 'claude-opus-5',
};

export function modelFor(checkType: CheckType): string {
  return MODEL_OVERRIDES[checkType] ?? DEFAULT_MODEL;
}

/**
 * PLAN.md §4: "Adaptive thinking. Kriter puanlama gibi zor işlerde
 * output_config.effort: 'high', ucuz kontrollerde 'low'."
 */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORT: Record<CheckType, Effort> = {
  language_template: 'low',
  title_content: 'low',
  category_fit: 'low',
  similarity: 'medium',
  criteria_scoring: 'high',
  feedback_synthesis: 'medium',
};

/**
 * PLAN.md §4: "her prompt bir sabitte, PROMPT_VERSIONS.criteria_scoring = 'v3'.
 * Sonuçla birlikte yazılır." → analysis_results.prompt_version
 * Prompt metnini her değiştirdiğinde buradaki sürümü artır.
 */
export const PROMPT_VERSIONS: Record<CheckType, string> = {
  language_template: 'v1',
  title_content: 'v1',
  category_fit: 'v1',
  similarity: 'v1',
  criteria_scoring: 'v1',
  feedback_synthesis: 'v1',
};

/**
 * PLAN.md §5.4 — kredi tasarrufu bayrağı.
 * Varsayılan AÇIK: env'de açıkça 'false' yazmadıkça gerçek API çağrılmaz.
 * Kazara para harcamaktan korur.
 */
export const MOCK_AI = process.env.MOCK_AI !== 'false';
