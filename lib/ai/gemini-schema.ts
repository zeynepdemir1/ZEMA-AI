import { z } from 'zod';

/**
 * Zod şeması → Gemini `responseJsonSchema`
 *
 * Gemini tam JSON Schema kabul etmiyor; @google/genai tip tanımlarındaki
 * belgelenmiş liste şu anahtarlarla sınırlı:
 *
 *   $id · $defs · $ref · $anchor · type · format · title · description ·
 *   enum · items · prefixItems · minItems · maxItems · minimum · maximum ·
 *   anyOf · oneOf · properties · additionalProperties · required
 *   (+ standart dışı propertyOrdering)
 *
 * Zod v4'ün z.toJSONSchema() çıktısı bunların dışında üç şey üretiyor:
 * `$schema`, `const` ve `exclusiveMinimum/Maximum`. Aşağıdaki dönüştürücü
 * bunları temizler veya en yakın desteklenen karşılığına çevirir.
 */

const SUPPORTED = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering',
]);

/** Alt şema taşıyan anahtarlar — özyinelemeli dolaşılır. */
const SCHEMA_VALUED = new Set(['items', 'additionalProperties']);
const SCHEMA_MAP_VALUED = new Set(['properties', '$defs']);
const SCHEMA_ARRAY_VALUED = new Set(['anyOf', 'oneOf', 'prefixItems']);

export type GeminiSchema = Record<string, unknown>;

export type ConversionResult = {
  schema: GeminiSchema;
  /** Atılan veya dönüştürülen anahtarlar — geliştirme sırasında görünür olsun. */
  notes: string[];
};

function convertNode(node: unknown, path: string, notes: string[]): unknown {
  if (Array.isArray(node)) return node.map((n, i) => convertNode(n, `${path}[${i}]`, notes));
  if (node === null || typeof node !== 'object') return node;

  const input = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    // ── Dönüştürülenler ──
    if (key === 'const') {
      // Gemini `const` bilmiyor; tek elemanlı enum aynı kısıtı ifade eder.
      out.enum = [value];
      continue;
    }
    if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
      // Sınır dahil/hariç ayrımı kayboluyor. z.number().positive() gibi
      // durumlarda pratikte fark yok; not düşülüyor.
      const target = key === 'exclusiveMinimum' ? 'minimum' : 'maximum';
      if (out[target] === undefined) out[target] = value;
      notes.push(`${path}: ${key} → ${target} (sınır dahil edildi)`);
      continue;
    }

    // ── Desteklenmeyenler ──
    if (!SUPPORTED.has(key)) {
      if (key !== '$schema') notes.push(`${path}: '${key}' atıldı (Gemini desteklemiyor)`);
      continue;
    }

    // ── Desteklenenler: alt şemalara in ──
    if (SCHEMA_VALUED.has(key)) {
      out[key] = convertNode(value, `${path}.${key}`, notes);
    } else if (SCHEMA_ARRAY_VALUED.has(key)) {
      out[key] = convertNode(value, `${path}.${key}`, notes);
    } else if (SCHEMA_MAP_VALUED.has(key) && value && typeof value === 'object') {
      const map: Record<string, unknown> = {};
      for (const [prop, sub] of Object.entries(value as Record<string, unknown>)) {
        map[prop] = convertNode(sub, `${path}.${key}.${prop}`, notes);
      }
      out[key] = map;
    } else {
      out[key] = value;
    }
  }

  // Gemini'ye alan sırasını bildirmek çıktı tutarlılığını artırıyor.
  if (out.properties && typeof out.properties === 'object' && !out.propertyOrdering) {
    out.propertyOrdering = Object.keys(out.properties as Record<string, unknown>);
  }

  return out;
}

/**
 * Zod şemasını Gemini'nin kabul ettiği JSON Schema alt kümesine çevirir.
 * `io: 'output'` → modelin ÜRETECEĞİ şekli kullan (input dönüşümleri değil).
 * `reused: 'inline'` → $ref/$defs üretmesin; Gemini'de $ref yanına başka
 * anahtar konamıyor, satır içi şema bu tuzağı tamamen atlatıyor.
 */
export function geminiSchemaFromZod(schema: z.ZodType): ConversionResult {
  const notes: string[] = [];
  const json = z.toJSONSchema(schema, {
    target: 'draft-7',
    io: 'output',
    reused: 'inline',
  }) as unknown;
  return { schema: convertNode(json, '$', notes) as GeminiSchema, notes };
}
