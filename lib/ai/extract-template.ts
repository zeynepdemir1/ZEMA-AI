import { callModel } from './call-claude-for-check';
import { DEFAULT_MODEL, modelChainFor } from './config';
import { verifyQuotes, type VerifiedQuote } from './evidence';
import { TEMPLATE_EXTRACTION_INSTRUCTION, TEMPLATE_EXTRACTION_ROLE } from './prompts';
import { TemplateSpecSchema, type TemplateSpec } from './schemas';
import templateFixture from './fixtures/template_spec.json';

export const TEMPLATE_PROMPT_VERSION = 'v3'; // v3: rapor içeriğinden değerlendirilemeyen kriterler (canlı sunum/prototip) artık çıkarılmıyor

export type TemplateExtraction = {
  spec: TemplateSpec;
  model: string;
  mocked: boolean;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
  /** Modelin verdiği alıntılar şablon metninde gerçekten var mı? */
  quotes: VerifiedQuote[];
};

/**
 * Yüklenen şablon PDF'inin metnini `competitions.template_spec`'e çevirir.
 *
 * Neden ayrı bir fonksiyon ve neden callModel üzerinden: bu bir "kontrol"
 * değil (analysis_results'a yazılmıyor, check_type'ı yok) ama yine de bir
 * model çağrısı. MOCK_AI kapısını baypas etmemesi için tek geçit olan
 * callModel kullanılıyor — aksi halde geliştirme sırasında sessizce kota
 * harcanırdı.
 *
 * Model zinciri template_compliance ile aynı: ikisi de şablon kuralları
 * üzerinde çalışıyor, ayrı bir zincir tutmanın faydası yok.
 */
export async function extractTemplateSpec(templateText: string): Promise<TemplateExtraction> {
  const r = await callModel({
    label: 'template_spec',
    models: modelChainFor('template_compliance'),
    systemInstruction: TEMPLATE_EXTRACTION_ROLE,
    parts: [
      { text: `<sablon>\n${templateText}\n</sablon>` },
      { text: TEMPLATE_EXTRACTION_INSTRUCTION },
    ],
    schema: TemplateSpecSchema,
    effort: 'medium',
    promptVersion: TEMPLATE_PROMPT_VERSION,
    mockPayload: templateFixture,
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
    // Halüsinasyon kalkanı: alıntılar şablon metninde birebir aranıyor.
    // Bulunamayan alıntı yöneticiye "doğrulanamadı" olarak gösteriliyor.
    quotes: verifyQuotes(templateText, r.payload.source_quotes),
  };
}
