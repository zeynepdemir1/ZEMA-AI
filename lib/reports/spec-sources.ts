/**
 * `template_spec` içinde HANGİ ALANIN HANGİ BELGEDEN geldiğini işaretler.
 *
 * NEDEN GEREKLİ — yaşanmış olay: Model Uydu şablonu yanlışlıkla İHA
 * yarışmasına uygulandı ve fark edilmesi ancak `format.footer` alanındaki
 * "11.TÜRKSAT Model Uydu" ifadesini gözle görmekle mümkün oldu. Tek bir
 * `source` alanı vardı ve iki belge devreye girince (şablon + şartname)
 * "bu kural hangi PDF'ten geldi" sorusu cevaplanamaz hale gelecekti.
 *
 * Artık her belge kendi künyesini `sources.<tür>` altına yazıyor ve HANGİ
 * ALANLARI doldurduğunu `fields` listesinde bildiriyor.
 */
export type SpecSourceKind = 'sablon' | 'sartname';

export type SpecSource = {
  kind: SpecSourceKind;
  file_path: string;
  model: string;
  prompt_version: string;
  extracted_at: string;
  page_count: number;
  extracted_chars: number;
  quotes_verified: number;
  quotes_total: number;
  /** Bu belgeden gelen alanlar — çakışma incelemesinde tek başvuru noktası. */
  fields: string[];
  /** Belgenin kendi beyan ettiği yarışma adı (şartnamede olur) — yanlış belge kontrolü. */
  declares?: string;
};

export const SOURCE_LABEL: Record<SpecSourceKind, string> = {
  sablon: 'Rapor şablonu',
  sartname: 'Şartname',
};

/** `template_spec` içindeki, KURAL OLMAYAN künye/geçmiş alanları. */
export const SPEC_METADATA_KEYS = ['source', 'sources', 'source_quotes', 'previous'] as const;

/**
 * Bir belgenin künyesini spec'e yerleştirir; diğer belgenin künyesine
 * DOKUNMAZ. Şablon yeniden yüklendiğinde şartnamenin künyesi kalır.
 */
export function withSource(
  spec: Record<string, unknown>,
  source: SpecSource,
): Record<string, unknown> {
  const existing = (spec.sources ?? {}) as Record<string, SpecSource>;
  return {
    ...spec,
    sources: { ...existing, [source.kind]: source },
    // Geriye dönük uyumluluk: eski UI ve sorgular `source`u okuyor.
    // Şablon künyesi oraya da yazılıyor, şartname yazılmıyor —
    // `source` tarihsel olarak şablonu ifade ediyordu.
    ...(source.kind === 'sablon' ? { source } : {}),
  };
}

/** Görüntüleme için: alan adı → onu dolduran belge. */
export function fieldOwners(spec: Record<string, unknown>): Record<string, SpecSourceKind> {
  const sources = (spec.sources ?? {}) as Record<string, SpecSource>;
  const out: Record<string, SpecSourceKind> = {};
  for (const s of Object.values(sources)) {
    for (const f of s.fields ?? []) out[f] = s.kind;
  }
  return out;
}
