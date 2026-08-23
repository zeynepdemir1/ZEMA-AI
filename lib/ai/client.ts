import Anthropic from '@anthropic-ai/sdk';

/**
 * Sunucu tarafı Claude istemcisi.
 * ANTHROPIC_API_KEY yalnızca sunucuda okunur (PLAN.md §10.3) — bu modül
 * hiçbir client component'ten import EDİLMEMELİ.
 */
let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!cached) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY tanımlı değil. Geliştirme sırasında MOCK_AI=true kullan (PLAN.md §5.4).',
      );
    }
    cached = new Anthropic();
  }
  return cached;
}
