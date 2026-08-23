import { GoogleGenAI } from '@google/genai';

/**
 * Sunucu tarafı Gemini istemcisi.
 * GOOGLE_API_KEY yalnızca sunucuda okunur — bu modül hiçbir client
 * component'ten import EDİLMEMELİ (PLAN.md §10.3'ün Gemini karşılığı).
 */
let cached: GoogleGenAI | null = null;

export function genai(): GoogleGenAI {
  if (!cached) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GOOGLE_API_KEY tanımlı değil. Geliştirme sırasında MOCK_AI=true kullan (PLAN.md §5.4). ' +
          'Anahtarı aistudio.google.com/apikey adresinden ücretsiz alabilirsin.',
      );
    }
    cached = new GoogleGenAI({ apiKey });
  }
  return cached;
}
