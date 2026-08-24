/**
 * `template_spec.not_specified` alan yollarını ("format.font",
 * "criteria[K1].weight") okunabilir Türkçe etikete çevirir.
 *
 * Ham yol adlarını doğrudan göstermek çok "AI/geliştirici" duruyordu —
 * Yarışma Yöneticisi için bir ürün ekranı, iç şema alanı değil.
 */
const FIELD_LABELS: Record<string, string> = {
  report_type: 'Rapor türü',
  language: 'Dil',
  required_sections: 'Zorunlu bölümler',
  'format.font': 'Yazı tipi',
  'format.page': 'Sayfa boyutu',
  'format.alignment': 'Hizalama',
  'format.max_pages': 'Sayfa sınırı',
  'format.footer': 'Altbilgi',
  citation_format: 'Atıf biçimi',
  criteria: 'Değerlendirme kriterleri (rubrik)',
  'criteria[].weight': 'Kriter ağırlıkları',
  'criteria[].max_score': 'Kriter azami puanları',
};

export function notSpecifiedLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];

  const perCriterion = /^criteria\[(.+?)\]\.(.+)$/.exec(key);
  if (perCriterion) {
    const [, code, field] = perCriterion;
    const fieldLabel = FIELD_LABELS[`format.${field}`] ?? FIELD_LABELS[field] ?? field;
    return `${code} kriterinin ${fieldLabel.toLocaleLowerCase('tr-TR')}`;
  }

  // Bilinmeyen bir yol geldiyse ham hâliyle göster — bilgi kaybetme.
  return key;
}
