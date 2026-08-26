import { ApiError } from '@google/genai';
import { keyCount, keyLabel } from './client';

/**
 * KOTA FALLBACK — iki boyutlu.
 *
 * Deneme sırası MODEL-BASKIN, anahtar ikincil:
 *
 *   flash/#1 → flash/#2 → flash/#3 → flash-lite/#1 → … → 3.7-flash/#3
 *
 * Sebep: kota model × proje başına ayrı. Bir modelin kotası bir anahtarda
 * dolduğunda ÖNCE diğer anahtarları denemek, hemen daha zayıf bir modele
 * düşmekten iyidir — analiz kalitesi korunur. Modelden düşmek son çare.
 *
 * Tükenen (model, anahtar) çifti bir süre "soğumaya" alınır ki sonraki
 * kontroller aynı doomed çağrıyı tekrar yapmasın. Soğuma çifti ELEMEZ,
 * yalnızca listenin sonuna atar: hepsi soğumadaysa bile deneme yapılır,
 * çünkü bellekteki işaret bayat olabilir (kota gece yarısı sıfırlanır,
 * süreç ise günlerce ayakta kalabilir).
 */
export type Attempt = { model: string; keyIndex: number };

/** Günlük kota için 10 dk kaba bir tahmin; 429'un kendi retryDelay'i varsa o kullanılır. */
const DEFAULT_COOLDOWN_MS = 10 * 60_000;
/** Geçersiz anahtar kotayla ilgisiz — süreç boyunca bir daha denenmesin. */
const INVALID_KEY_COOLDOWN_MS = 365 * 24 * 60 * 60_000;
/**
 * 403 için KISA soğuma. Sebep sahada görüldü: yeni açılmış bir Google Cloud
 * projesinde Gemini API etkinleştirildikten sonra birkaç dakika boyunca
 * "has not been used in project N before or it is disabled" 403'ü dönüyor,
 * sonra kendiliğinden düzeliyor. Bu anahtarı bir yıllığına elemek, iki
 * dakika sonra geçerli olacak bir anahtarı kalıcı olarak kaybetmek olurdu.
 */
const KEY_BLOCKED_COOLDOWN_MS = 15 * 60_000;
/**
 * 5xx (özellikle 504 DEADLINE_EXCEEDED) için KISA soğuma. Sahada görüldü:
 * ağır çok-modlu isteklerde (template_compliance) gemini-3.5-flash sürekli
 * 504 veriyordu, flash-lite aynı isteği sorunsuz tamamladı — anahtara değil
 * modelin o anki yüküne özgü. 429/403'ten daha kısa: aşırı yük dakikalar
 * içinde geçebilir, saatlerce elemek gereksiz kota kaybı olurdu.
 */
const SERVER_OVERLOAD_COOLDOWN_MS = 3 * 60_000;

const coolingUntil = new Map<string, number>();

const id = (a: Attempt) => `${a.model}|${a.keyIndex}`;

export function isCooling(a: Attempt): boolean {
  const until = coolingUntil.get(id(a));
  return until !== undefined && until > Date.now();
}

export function markExhausted(a: Attempt, retryAfterMs?: number): void {
  coolingUntil.set(id(a), Date.now() + (retryAfterMs ?? DEFAULT_COOLDOWN_MS));
}

/**
 * Anahtarın KENDİSİ kullanılamıyor: tüm modeller için ele.
 * Süre çağıran tarafından belirlenir — kalıcı bozukluk (400) ile geçici
 * engel (403) aynı şey değil.
 */
export function markKeyInvalid(
  keyIndex: number,
  models: string[],
  cooldownMs: number = INVALID_KEY_COOLDOWN_MS,
): void {
  for (const model of models) {
    coolingUntil.set(id({ model, keyIndex }), Date.now() + cooldownMs);
  }
}

export const KEY_BLOCKED_MS = KEY_BLOCKED_COOLDOWN_MS;
export const SERVER_OVERLOAD_MS = SERVER_OVERLOAD_COOLDOWN_MS;

export function attemptPlan(models: string[], keys = keyCount()): Attempt[] {
  const pairs: Attempt[] = [];
  for (const model of models) {
    for (let k = 0; k < Math.max(1, keys); k++) pairs.push({ model, keyIndex: k });
  }
  // Stabil bölme: soğumada olmayanlar tercih sırasını koruyarak öne geçer.
  const fresh = pairs.filter((p) => !isCooling(p));
  const cooling = pairs.filter((p) => isCooling(p));
  return [...fresh, ...cooling];
}

export function describeAttempt(a: Attempt): string {
  return `${a.model} / ${keyLabel(a.keyIndex)}`;
}

/** 429 gövdesindeki RetryInfo'yu yakala: {"retryDelay":"31s"} veya Retry-After. */
export function retryAfterMs(e: unknown): number | undefined {
  const text = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const m = /retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i.exec(text) ?? /retry-after"?\s*[:=]\s*"?(\d+)/i.exec(text);
  if (!m) return undefined;
  const sec = Number(m[1]);
  return Number.isFinite(sec) && sec > 0 ? Math.min(sec * 1000, DEFAULT_COOLDOWN_MS) : undefined;
}

/** Anahtarın kendisi mi geçersiz? (400 + API_KEY_INVALID) — kalıcı. */
export function isInvalidKeyError(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.status !== 400) return false;
  return /API_KEY_INVALID|API key not valid|API key expired/i.test(e.message);
}

/**
 * Anahtar geçerli ama BU ANAHTARLA erişilemiyor mu? (403)
 *
 * Kaynakları: projede Gemini API etkin değil (SERVICE_DISABLED), anahtara
 * konmuş kısıt (referrer/IP), faturalandırma engeli. Hepsi ANAHTARA özgü —
 * başka bir anahtarla aynı istek çalışır.
 *
 * NEDEN ÖNEMLİ: 403 daha önce fallthrough listesinde DEĞİLDİ, yani zinciri
 * olduğu yerde kesiyordu. Dört anahtarlı bir havuzda ilk üçü 429 alıp
 * dördüncüsü 403 verdiğinde çağrı tamamen başarısız oluyordu — oysa
 * zincirdeki DİĞER MODELLERİN ilk üç anahtardaki kotası hiç denenmemiş
 * oluyordu. Sahada 25 Ağustos'ta yeni eklenen anahtarda tam olarak bu 403
 * görüldü (birkaç dakika sonra kendiliğinden düzeldi).
 */
export function isKeyBlockedError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403;
}

/** Tanı çıktısı — hangi çiftler soğumada? Anahtar DEĞERİ asla yazılmaz. */
export function poolStatus(models: string[]): string {
  const now = Date.now();
  const cooling = attemptPlan(models)
    .filter(isCooling)
    .map((a) => {
      const left = Math.round(((coolingUntil.get(id(a)) ?? now) - now) / 1000);
      return `${describeAttempt(a)} (${left}s)`;
    });
  return `${keyCount()} anahtar × ${models.length} model` +
    (cooling.length ? ` · soğumada: ${cooling.join(', ')}` : ' · tümü hazır');
}

/** Test/script için. */
export function resetPoolState(): void {
  coolingUntil.clear();
}
