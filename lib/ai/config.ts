import { ThinkingLevel } from '@google/genai';

/**
 * ZEMA — model sağlayıcı yapılandırması
 * Kaynak: docs/PLAN.md §4 (ortak ilkeler), §5.4 (mock mod)
 *
 * ⚠️ SAĞLAYICI DEĞİŞİKLİĞİ: Bütçe kısıtı nedeniyle Claude API yerine
 * Google Gemini API (ücretsiz katman) kullanılıyor. PLAN.md §4/§5 hâlâ
 * Claude'u anlatıyor — plan güncellenmeli. Anthropic anahtarı ve model
 * sabiti ileride geri dönmek üzere korundu ama HİÇBİR YERDE KULLANILMIYOR.
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

// ─────────────────────────────────────────────────────────────
// Model seçimi
// ─────────────────────────────────────────────────────────────

/**
 * 2026-08-23'te canlı API'ye karşı ölçülerek seçildi:
 *
 *   gemini-2.5-*      → 404 NOT_FOUND (artık yok)
 *   gemini-3.7-flash  → MINIMAL düşünme seviyesi desteklenmiyor (400),
 *                       MEDIUM/HIGH'da tekrarlanan 429/503
 *   gemini-3.5-flash  → dört düşünme seviyesinin hepsi ilk denemede çalıştı
 *
 * Alias (`gemini-flash-latest`) KULLANILMIYOR: sessizce değişince PLAN.md §1'in
 * denetlenebilirlik iddiası ("her AI çıktısı için model id loglanır") bozulur.
 * Gerçekte çalışan sürüm ayrıca response.modelVersion'dan kaydedilir.
 */
export const DEFAULT_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';

/**
 * PLAN.md §4 notunun Gemini karşılığı: en kritik kontrol daha güçlü bir
 * modele yükseltilebilir, diğerleri ucuz modelde kalır. Şimdilik boş —
 * ücretsiz katmanda tek model kullanılıyor.
 */
export const MODEL_OVERRIDES: Partial<Record<CheckType, string>> = {
  // criteria_scoring: 'gemini-3.5-pro',
};

export function modelFor(checkType: CheckType): string {
  return MODEL_OVERRIDES[checkType] ?? DEFAULT_MODEL;
}

/**
 * KOTA FALLBACK ZİNCİRİ.
 *
 * Ücretsiz katman kotası MODEL BAŞINA günde 20 istek. Tek modele bağlı kalmak
 * demo sırasında "kota doldu" hatası anlamına gelir — kabul edilemez. Bir model
 * 429 (kota) veya 404 (model kaldırılmış) verirse sıradaki denenir.
 *
 * Sıra bilinçli: en yetenekliden en dayanıklıya. 3.7-flash en sonda çünkü
 * ölçümlerde MINIMAL düşünme seviyesini desteklemiyor ve 503'e daha yatkın.
 *
 * Hangi modelin gerçekten yanıt verdiği analysis_results.model'e yazılıyor,
 * yani denetlenebilirlik korunuyor.
 */
export const MODEL_CHAIN: string[] = (
  process.env.GEMINI_MODEL_CHAIN ??
  'gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.7-flash'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

/**
 * Bir kontrol için denenecek model sırası: önce o kontrole atanmış model,
 * sonra zincirdeki diğerleri (tekrar etmeden).
 */
export function modelChainFor(checkType: CheckType): string[] {
  const primary = modelFor(checkType);
  return [primary, ...MODEL_CHAIN.filter((m) => m !== primary)];
}

/** Kullanılmıyor — sağlayıcı geri alınırsa referans olsun diye bırakıldı. */
export const ANTHROPIC_MODEL_LEGACY = 'claude-sonnet-5';

// ─────────────────────────────────────────────────────────────
// Düşünme bütçesi (Claude'daki output_config.effort'un karşılığı)
// ─────────────────────────────────────────────────────────────

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * PLAN.md §4: "Kriter puanlama gibi zor işlerde effort: 'high', ucuz
 * kontrollerde 'low'." Gemini 3.x'teki karşılığı thinkingLevel.
 *
 * gemini-3.5-flash'ta ölçülen düşünme token'ları:
 *   MINIMAL 0 · LOW 441 · MEDIUM 934 · HIGH 1691
 *
 * ⚠️ MINIMAL her modelde yok — gemini-3.7-flash bunu 400 ile reddediyor.
 * Model değiştirirsen bu tabloyu yeniden doğrula.
 */
export const THINKING_LEVEL: Record<Effort, ThinkingLevel> = {
  low: ThinkingLevel.MINIMAL, // ucuz, deterministik kontroller
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH, // criteria_scoring — ana özellik
  xhigh: ThinkingLevel.HIGH,
  max: ThinkingLevel.HIGH,
};

export const EFFORT: Record<CheckType, Effort> = {
  language_template: 'low',
  title_content: 'low',
  category_fit: 'low',
  similarity: 'medium',
  criteria_scoring: 'high',
  feedback_synthesis: 'medium',
};

// ─────────────────────────────────────────────────────────────
// Prompt sürümleri ve mock bayrağı (sağlayıcıdan bağımsız)
// ─────────────────────────────────────────────────────────────

/**
 * PLAN.md §4: "her prompt bir sabitte. Sonuçla birlikte yazılır."
 * → analysis_results.prompt_version
 */
export const PROMPT_VERSIONS: Record<CheckType, string> = {
  language_template: 'v2', // v2: gerçek yazım hatası tespiti + ÖTR şablonu
  title_content: 'v1',
  category_fit: 'v1',
  similarity: 'v1',
  criteria_scoring: 'v1',
  feedback_synthesis: 'v1',
};

/**
 * PLAN.md §5.4 — kredi tasarrufu bayrağı.
 * Varsayılan AÇIK: env'de açıkça 'false' yazmadıkça gerçek API çağrılmaz.
 */
export const MOCK_AI = process.env.MOCK_AI !== 'false';

// ─────────────────────────────────────────────────────────────
// Skor eşikleri ve kontrol sınıflandırması
// ─────────────────────────────────────────────────────────────

/**
 * Sayısal skor üreten kontrollerin karar eşiği.
 *
 * Önceden karar modelin kendi `verdict` alanından geliyordu ve hangi mantığa
 * dayandığı belirsizdi — aynı skor bazen "warn" bazen "pass" alabiliyordu.
 * Artık karar TEK bir yerden, deterministik olarak türetiliyor.
 *
 * Eşiği değiştirmek için burayı düzenlemek yeterli; hem yazma anında
 * (deriveVerdict) hem okuma anında (loadReview) aynı fonksiyon kullanılıyor.
 */
export const SCORE_THRESHOLDS = { pass: 75, warn: 50 } as const;

/** Rozetin yanında gösterilecek açıklama — "keyfi" görünmesin. */
export const THRESHOLD_NOTE =
  `%${SCORE_THRESHOLDS.pass}+ uygun · ` +
  `%${SCORE_THRESHOLDS.warn}-${SCORE_THRESHOLDS.pass - 1} dikkat · ` +
  `%${SCORE_THRESHOLDS.warn} altı uygun değil`;

export type ScoreVerdict = 'pass' | 'warn' | 'fail';

export function verdictFromScore(score: number): ScoreVerdict {
  if (score >= SCORE_THRESHOLDS.pass) return 'pass';
  if (score >= SCORE_THRESHOLDS.warn) return 'warn';
  return 'fail';
}

/**
 * Kontroller iki gruba ayrılır:
 *
 * - `numeric`  → 0-100 arası bir uyum skoru üretir; kararı SCORE_THRESHOLDS
 *                belirler ve skor yüzde olarak gösterilir.
 * - `judgment` → skor anlamlı değil; kararı modelin kendi yargısı verir ve
 *                yapay bir yüzde UYDURULMAZ. (Benzerlik bir istisna: onun
 *                yüzdesi gerçek bir ölçüm, "uyum skoru" değil.)
 */
export const CHECK_SCORING: Record<CheckType, 'numeric' | 'judgment'> = {
  language_template: 'numeric',
  title_content: 'numeric',
  criteria_scoring: 'numeric',
  category_fit: 'judgment',
  similarity: 'judgment',
  feedback_synthesis: 'judgment',
};

/**
 * §4.4 aşama 1 — trigram aday eşiği.
 *
 * SQL fonksiyonundaki taban 0.05'ti ve pratikte HER çifti modele gönderiyordu:
 * aynı yarışmadaki raporlar ortak şablon/terminoloji yüzünden doğal olarak
 * 0.50-0.60 bandında benziyor. Sonuç, dokuz demo raporunun hepsinin
 * "benzerlik: fail" alması oldu — gürültü, bulgu değil.
 *
 * 0.65 eşiği ortak-şablon gürültüsünü keser, gerçek metin örtüşmesini geçirir.
 * Ayrıca modele giden çift sayısını düşürerek kotayı korur.
 * Değeri değiştirirken similarity_pairs'i temizleyip yeniden analiz gerekir.
 */
export const SIMILARITY_MIN_LEXICAL = Number(process.env.SIMILARITY_MIN_LEXICAL ?? '0.65');
