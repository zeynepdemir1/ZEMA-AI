import { callModel } from './call-claude-for-check';
import { DEFAULT_MODEL, modelChainFor } from './config';
import { verifyQuotes, type VerifiedQuote } from './evidence';
import { RULEBOOK_EXTRACTION_INSTRUCTION, RULEBOOK_EXTRACTION_ROLE } from './prompts';
import { RulebookSpecSchema, type RulebookSpec } from './schemas';
import rulebookFixture from './fixtures/rulebook_spec.json';

export const RULEBOOK_PROMPT_VERSION = 'v1';

export type RulebookExtraction = {
  spec: RulebookSpec;
  model: string;
  mocked: boolean;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
  /** Modelin verdiği alıntılar şartname metninde gerçekten var mı? */
  quotes: VerifiedQuote[];
};

/**
 * Şartname PDF'inin metnini değerlendirme rubriğine çevirir.
 *
 * NEDEN ŞABLONDAN AYRI: puanlama rubriği çoğu yarışmada rapor şablonunda
 * DEĞİL şartnamede. Sahada ölçüldü — gerçek bir ÖTR şablonundan ve bir
 * Model Uydu PDR şablonundan çıkarılan kriter sayısı ikisinde de 0. Şablon
 * "raporu nasıl yazacaksın"ı, şartname "nasıl puanlanacaksın"ı anlatıyor.
 *
 * Şablon çıkarımıyla aynı kapıdan (callModel) geçiyor: MOCK_AI baypas
 * edilmesin ve model/anahtar fallback zinciri burada da işlesin.
 */
export async function extractRulebookSpec(rulebookText: string): Promise<RulebookExtraction> {
  const r = await callModel({
    label: 'rulebook_spec',
    // Şablon çıkarımıyla aynı zincir: ikisi de kural belgesi okuyor.
    models: modelChainFor('template_compliance'),
    systemInstruction: RULEBOOK_EXTRACTION_ROLE,
    parts: [
      { text: `<sartname>\n${rulebookText}\n</sartname>` },
      { text: RULEBOOK_EXTRACTION_INSTRUCTION },
    ],
    schema: RulebookSpecSchema,
    // Rubrik çıkarımı tablo okumayı ve ağırlık hesabını gerektiriyor;
    // şablonun bölüm listesinden daha zor bir iş.
    effort: 'high',
    promptVersion: RULEBOOK_PROMPT_VERSION,
    mockPayload: rulebookFixture,
    mockModel: DEFAULT_MODEL,
  });

  return {
    spec: r.payload,
    model: r.model,
    mocked: r.mocked,
    usage: r.usage
      ? {
          input_tokens: r.usage.input_tokens,
          output_tokens: r.usage.output_tokens,
          total_tokens: r.usage.total_tokens,
        }
      : null,
    // Halüsinasyon kalkanı: alıntılar şartname metninde birebir aranıyor.
    quotes: verifyQuotes(rulebookText, r.payload.source_quotes),
  };
}
