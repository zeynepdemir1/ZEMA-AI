import { GoogleGenAI } from '@google/genai';

/**
 * Sunucu tarafı Gemini istemci HAVUZU.
 *
 * Anahtarlar yalnızca sunucuda okunur — bu modül hiçbir client component'ten
 * import EDİLMEMELİ (PLAN.md §10.3'ün Gemini karşılığı).
 *
 * NEDEN HAVUZ: ücretsiz katman kotası PROJE × MODEL başına günde 20 istek.
 * Dokuz raporun altı kontrolü = 54 çağrı, yani tek anahtarla tek günde
 * demoyu hazırlamak mümkün değil. Birden fazla Google AI Studio projesinden
 * anahtar eklenince kota toplanır: N anahtar × M model × 20 istek/gün.
 *
 * ⚠️ Anahtarların FARKLI PROJELERDEN olması şart. Aynı projeden üretilen
 * ikinci anahtar aynı kota havuzunu paylaşır ve hiçbir şey kazandırmaz;
 * havuz bunu tespit EDEMEZ (anahtar dizeleri farklıdır, dedupe yakalamaz).
 *
 * Anahtar sırası: GOOGLE_API_KEY (varsa) sonra GOOGLE_API_KEY_1..10.
 * Tekrarlananlar atılır — aynı anahtarı iki değişkene yapıştırmak boşuna
 * 429 turu demek olurdu.
 */
const MAX_NUMBERED_KEYS = 10;

let keys: string[] | null = null;
const clients = new Map<number, GoogleGenAI>();

export function apiKeys(): string[] {
  if (keys) return keys;
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string | undefined) => {
    const k = raw?.trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  };
  add(process.env.GOOGLE_API_KEY);
  for (let i = 1; i <= MAX_NUMBERED_KEYS; i++) add(process.env[`GOOGLE_API_KEY_${i}`]);
  keys = out;
  return out;
}

export function keyCount(): number {
  return apiKeys().length;
}

/**
 * Anahtarı ASLA loglamıyoruz — ne tamamını ne son karakterlerini. Log'da
 * yalnızca sıra numarası görünür; hangi anahtarın hangi sırada olduğunu
 * .env'i yazan kişi bilir, log'u okuyan yabancı bilmez.
 */
export function keyLabel(index: number): string {
  return `anahtar #${index + 1}`;
}

export function genai(keyIndex = 0): GoogleGenAI {
  const pool = apiKeys();
  if (pool.length === 0) {
    throw new Error(
      'Google API anahtarı tanımlı değil (GOOGLE_API_KEY veya GOOGLE_API_KEY_1..10). ' +
        'Geliştirme sırasında MOCK_AI=true kullan (PLAN.md §5.4). ' +
        'Anahtarı aistudio.google.com/apikey adresinden ücretsiz alabilirsin.',
    );
  }
  if (keyIndex < 0 || keyIndex >= pool.length) {
    throw new Error(`genai(): geçersiz anahtar indeksi ${keyIndex} (havuzda ${pool.length} anahtar var)`);
  }
  let client = clients.get(keyIndex);
  if (!client) {
    client = new GoogleGenAI({ apiKey: pool[keyIndex] });
    clients.set(keyIndex, client);
  }
  return client;
}

/** Test/script'lerde env değiştikten sonra havuzu yeniden okumak için. */
export function resetKeyPool(): void {
  keys = null;
  clients.clear();
}
