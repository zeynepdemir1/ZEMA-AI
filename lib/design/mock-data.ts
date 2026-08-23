/**
 * ZEMA — tasarım fixture verisi
 *
 * Kaynak: Claude Design projesi "Hakem İnceleme Tasarım Sistemi",
 * dosya "ZEMA Ekranlar.dc.html" (prototipin state bloğu).
 *
 * ⚠️ Bu dosya GEÇİCİ. Supabase sorguları devreye girince (PLAN.md Gün 2-6)
 * ekranlar bu sabitler yerine DB'den beslenecek. Şekiller bilinçli olarak
 * PLAN.md §3'teki tablo kolonlarına yakın tutuldu ki geçiş kolay olsun.
 */

export type ReportStatusKey = 'onaylandı' | 'inceleniyor' | 'bekliyor' | 'dikkat';
export type CriterionStatus = 'done' | 'partial' | 'missing';
export type CardOrigin = 'ai' | 'hakem';
export type MatchVerdict = 'real' | 'false' | null;
export type MatchKind = 'metin';

export type Report = {
  code: string;
  team: string;
  status: ReportStatusKey;
  progress: string;
  similarity: number;
  category: string;
};

export const CATEGORY_NAMES = ['Sabit Kanat', 'Döner Kanat', 'Serbest Görev'] as const;

export const COMPETITION_NAME = 'İNSANSIZ HAVA ARAÇLARI YARIŞMASI';

export const REPORTS: Report[] = [
  { code: 'R-0179', team: 'ATMACA', status: 'onaylandı', progress: '6/6', similarity: 33, category: 'Sabit Kanat' },
  { code: 'R-0184', team: 'GARO', status: 'inceleniyor', progress: '2/6', similarity: 62, category: 'Sabit Kanat' },
  { code: 'R-0188', team: 'RÜZGÂR', status: 'bekliyor', progress: '0/6', similarity: 18, category: 'Döner Kanat' },
  { code: 'R-0191', team: 'PUSAT', status: 'bekliyor', progress: '0/6', similarity: 41, category: 'Döner Kanat' },
  { code: 'R-0196', team: 'SİMURG', status: 'dikkat', progress: '0/6', similarity: 74, category: 'Serbest Görev' },
  { code: 'R-0203', team: 'KIVILCIM', status: 'bekliyor', progress: '0/6', similarity: 19, category: 'Serbest Görev' },
];

/** Varsayılan olarak açılan rapor — demo akışının başladığı yer (PLAN.md §9). */
export const DEFAULT_REPORT_CODE = 'R-0184';

export function findReport(code: string): Report | undefined {
  return REPORTS.find((r) => r.code === code);
}

// ─────────────────────────────────────────────────────────────
// Benzerlik eşleşmeleri (1'e-N — PLAN.md §4.4)
// ─────────────────────────────────────────────────────────────

export type Match = {
  team: string;
  code: string;
  pct: number;
  analysis: string;
  thisRef: string;
  otherRef: string;
  thisExcerpt: string;
  otherExcerpt: string;
};

export const MATCHES: Record<string, Match[]> = {
  'R-0184': [
    {
      team: 'SİMURG', code: 'R-0196', pct: 41,
      analysis:
        'İki raporun görev yönetim mimarisi bölümleri büyük ölçüde örtüşüyor. Bu raporun Bölüm 3.2\'sindeki katman tanımı ile karşılaştırılan raporun Bölüm 2.4\'ündeki tanım, cümle sırası ve terimler dahil aynı; yalnızca donanım isimleri değiştirilmiş. Kaynakça da 6 ortak atıf içeriyor.',
      thisRef: 'BÖLÜM 3.2 · GÖREV YÖNETİM KATMANI', otherRef: 'BÖLÜM 2.4 · SİSTEM KATMANLARI',
      thisExcerpt:
        'Görev yönetim katmanı, uçuş kontrol kartından gelen telemetriyi 50 ms periyotla toplayarak karar motoruna iletir; karar motoru hedef önceliklendirmesini bu veriye göre günceller.',
      otherExcerpt:
        'Görev yönetim katmanı, uçuş kontrol kartından gelen telemetriyi 50 ms periyotla toplayarak karar motoruna iletir; karar motoru hedef önceliklendirmesini bu veri üzerinden günceller.',
    },
    {
      team: 'PUSAT', code: 'R-0191', pct: 27,
      analysis:
        'Benzerlik bütçe tablosunda yoğunlaşıyor. Bu raporun Bölüm 5.2\'sindeki malzeme bütçesi ile karşılaştırılan raporun Bölüm 5.4\'ündeki tablo, dört satırın üçünde kalem adı, adet ve birim fiyat dahil birebir aynı. Yalnızca gövde kalemi farklılaşıyor.',
      thisRef: 'BÖLÜM 5.2 · MALZEME BÜTÇESİ', otherRef: 'BÖLÜM 5.4 · MALZEME BÜTÇESİ',
      thisExcerpt: 'Fırçasız motor, LiPo batarya ve telemetri modülü kalemleri aynı adet ve birim fiyatlarla listelenmiştir.',
      otherExcerpt: 'Fırçasız motor, LiPo batarya ve telemetri modülü kalemleri aynı adet ve birim fiyatlarla listelenmiştir.',
    },
    {
      team: 'KIVILCIM', code: 'R-0203', pct: 14,
      analysis:
        'Örtüşme görsel düzeyinde ve büyük ölçüde şablon kaynaklı. Bu raporun Şek. 5.2\'sindeki gövde yerleşim çizimi ile karşılaştırılan raporun Şek. 4.1\'i aynı motor yerleşimini ve gövde oranlarını kullanıyor; ölçü etiketleri ve kesit detayları farklı.',
      thisRef: 'ŞEK. 5.2 · GÖVDE YERLEŞİM ÇİZİMİ', otherRef: 'ŞEK. 4.1 · GÖVDE YERLEŞİM ÇİZİMİ',
      thisExcerpt: 'Dört rotorlu gövde yerleşimi, merkez kesit ve kol uzunlukları şemada gösterilmiştir.',
      otherExcerpt: 'Dört rotorlu gövde yerleşimi, merkez kesit ve kol uzunlukları şemada gösterilmiştir.',
    },
  ],
  'R-0196': [
    {
      team: 'GARO', code: 'R-0184', pct: 41,
      analysis:
        'Görev yönetim mimarisi tanımı iki raporda da neredeyse birebir aynı. Bu raporun Bölüm 2.4\'ü ile karşılaştırılan raporun Bölüm 3.2\'si aynı cümle yapısını ve terimleri kullanıyor.',
      thisRef: 'BÖLÜM 2.4 · SİSTEM KATMANLARI', otherRef: 'BÖLÜM 3.2 · GÖREV YÖNETİM KATMANI',
      thisExcerpt: 'Görev yönetim katmanı, uçuş kontrol kartından gelen telemetriyi 50 ms periyotla toplayarak karar motoruna iletir.',
      otherExcerpt: 'Görev yönetim katmanı, uçuş kontrol kartından gelen telemetriyi 50 ms periyotla toplayarak karar motoruna iletir.',
    },
    {
      team: 'ATMACA', code: 'R-0179', pct: 33,
      analysis:
        'Bu raporun Bölüm 4.2\'sindeki test protokolü, karşılaştırılan raporun Bölüm 3.6\'sındaki protokolle aynı adımları aynı sırayla listeliyor. Ölçüm değerleri farklı; metin yapısı ortak.',
      thisRef: 'BÖLÜM 4.2 · TEST PROTOKOLÜ', otherRef: 'BÖLÜM 3.6 · DOĞRULAMA ADIMLARI',
      thisExcerpt: 'Her uçuş öncesi batarya gerilimi, GPS kilit süresi ve telemetri gecikmesi sırasıyla ölçülür ve kayıt altına alınır.',
      otherExcerpt: 'Uçuş öncesinde batarya gerilimi, GPS kilit süresi ve telemetri gecikmesi sırasıyla ölçülerek kayıt altına alınır.',
    },
  ],
  'R-0179': [
    {
      team: 'SİMURG', code: 'R-0196', pct: 33,
      analysis:
        'Test protokolü adımları iki raporda da aynı sırayla listelenmiş. Bu raporun Bölüm 3.6\'sı ile karşılaştırılan raporun Bölüm 4.2\'si aynı cümle yapısını kullanıyor; ölçüm değerleri farklı.',
      thisRef: 'BÖLÜM 3.6 · DOĞRULAMA ADIMLARI', otherRef: 'BÖLÜM 4.2 · TEST PROTOKOLÜ',
      thisExcerpt: 'Uçuş öncesinde batarya gerilimi, GPS kilit süresi ve telemetri gecikmesi sırasıyla ölçülerek kayıt altına alınır.',
      otherExcerpt: 'Her uçuş öncesi batarya gerilimi, GPS kilit süresi ve telemetri gecikmesi sırasıyla ölçülür ve kayıt altına alınır.',
    },
  ],
  'R-0191': [
    {
      team: 'GARO', code: 'R-0184', pct: 27,
      analysis:
        'Bütçe tabloları büyük ölçüde aynı. Bu raporun Bölüm 5.4\'ündeki malzeme bütçesi ile karşılaştırılan raporun Bölüm 5.2\'si, dört satırın üçünde kalem adı, adet ve birim fiyat dahil birebir örtüşüyor; yalnızca gövde kalemi farklı.',
      thisRef: 'BÖLÜM 5.4 · MALZEME BÜTÇESİ', otherRef: 'BÖLÜM 5.2 · MALZEME BÜTÇESİ',
      thisExcerpt: 'Fırçasız motor, LiPo batarya ve telemetri modülü kalemleri aynı adet ve birim fiyatlarla listelenmiştir.',
      otherExcerpt: 'Fırçasız motor, LiPo batarya ve telemetri modülü kalemleri aynı adet ve birim fiyatlarla listelenmiştir.',
    },
    {
      team: 'RÜZGÂR', code: 'R-0188', pct: 18,
      analysis:
        'Zaman planı tabloları örtüşüyor. Bu raporun Bölüm 5.1\'indeki faz tablosu ile karşılaştırılan raporun Bölüm 5.1\'i, dört fazın üçünde hafta aralığı ve durum sütunu dahil aynı; yalnızca entegrasyon fazı farklı.',
      thisRef: 'BÖLÜM 5.1 · ZAMAN PLANI TABLOSU', otherRef: 'BÖLÜM 5.1 · ZAMAN PLANI TABLOSU',
      thisExcerpt: 'Tasarım, Prototipleme ve Saha Testi fazları aynı hafta aralıklarıyla planlanmıştır.',
      otherExcerpt: 'Tasarım, Prototipleme ve Saha Testi fazları aynı hafta aralıklarıyla planlanmıştır.',
    },
  ],
  'R-0203': [
    {
      team: 'GARO', code: 'R-0184', pct: 14,
      analysis:
        'Örtüşme görsel düzeyinde ve şablon kaynaklı. Bu raporun Şek. 4.1\'indeki gövde yerleşim çizimi ile karşılaştırılan raporun Şek. 5.2\'si aynı motor yerleşimini ve gövde oranlarını kullanıyor; ölçü etiketleri farklı.',
      thisRef: 'ŞEK. 4.1 · GÖVDE YERLEŞİM ÇİZİMİ', otherRef: 'ŞEK. 5.2 · GÖVDE YERLEŞİM ÇİZİMİ',
      thisExcerpt: 'Dört rotorlu gövde yerleşimi, merkez kesit ve kol uzunlukları şemada gösterilmiştir.',
      otherExcerpt: 'Dört rotorlu gövde yerleşimi, merkez kesit ve kol uzunlukları şemada gösterilmiştir.',
    },
  ],
  'R-0188': [
    {
      team: 'PUSAT', code: 'R-0191', pct: 18,
      analysis:
        'Zaman planı tabloları örtüşüyor. Bu raporun Bölüm 5.1\'indeki faz tablosu ile karşılaştırılan raporun Bölüm 5.1\'i, dört fazın üçünde hafta aralığı ve durum sütunu dahil aynı; yalnızca entegrasyon fazı farklı.',
      thisRef: 'BÖLÜM 5.1 · ZAMAN PLANI TABLOSU', otherRef: 'BÖLÜM 5.1 · ZAMAN PLANI TABLOSU',
      thisExcerpt: 'Tasarım, Prototipleme ve Saha Testi fazları aynı hafta aralıklarıyla planlanmıştır.',
      otherExcerpt: 'Tasarım, Prototipleme ve Saha Testi fazları aynı hafta aralıklarıyla planlanmıştır.',
    },
  ],
};


export type MatchMeta = {
  kind: MatchKind;
  /** Vurgulanacak ortak pasaj */
  overlap?: string;
  caption?: string;
};


/** Anahtar: `<buRapor>#<karşılaştırılan>` */
export const MATCH_META: Record<string, MatchMeta> = {
  'R-0184#R-0196': { kind: 'metin', overlap: 'telemetriyi 50 ms periyotla toplayarak karar motoruna iletir' },
  'R-0196#R-0184': { kind: 'metin', overlap: 'telemetriyi 50 ms periyotla toplayarak karar motoruna iletir' },
  'R-0196#R-0179': { kind: 'metin', overlap: 'batarya gerilimi, GPS kilit süresi ve telemetri gecikmesi sırasıyla' },
  'R-0179#R-0196': { kind: 'metin', overlap: 'batarya gerilimi, GPS kilit süresi ve telemetri gecikmesi sırasıyla' },
};

// ─────────────────────────────────────────────────────────────
// Kriter kartları (PLAN.md §4.5 — ai_criterion_scores)
// ─────────────────────────────────────────────────────────────

export type CriterionCard = {
  code: string;
  title: string;
  status: CriterionStatus;
  /** Rubrikten gelen beklenti — criteria.description karşılığı */
  beklenti: string;
  /** Kanıt referansı — evidence[].section_ref karşılığı */
  ref: string;
  /** 'ai' = ai_text gösteriliyor, 'hakem' = final_text onaylı */
  origin: CardOrigin;
  text: string;
};

export const CARDS: CriterionCard[] = [
  {
    code: 'K-01', title: 'Problem Tanımı', status: 'done', origin: 'hakem', ref: 'BÖLÜM 1.2',
    beklenti: 'Çözülmek istenen problem, hedef kullanıcı ve mevcut durumun eksikliği sayısal veriyle birlikte tanımlanmalıdır.',
    text: 'Problem tanımınız net ve ölçülebilir: mevcut sistemin 4,2 sn olan tepki süresini gerekçe olarak sunmanız kriteri tam karşılıyor.',
  },
  {
    code: 'K-02', title: 'Literatür ve Özgünlük', status: 'partial', origin: 'ai', ref: 'BÖLÜM 2.1 · BENZERLİK %62',
    beklenti: 'En az beş güncel kaynak taranmalı, önerilen çözümün mevcut çalışmalardan farkı açıkça belirtilmelidir.',
    text: 'Literatür taraması yapılmış ancak kaynakların dördü 2019 öncesi. Ayrıca Bölüm 2.1\'de özgünlük iddiası var, hangi çalışmadan hangi yönüyle ayrıştığı belirtilmemiş. Son iki yıla ait iki kaynak ekleyip farkı bir tablo ile göstermeniz önerilir.',
  },
  {
    code: 'K-03', title: 'Yöntem ve Sistem Mimarisi', status: 'done', origin: 'ai', ref: 'BÖLÜM 3',
    beklenti: 'Sistem bileşenleri, veri akışı ve donanım-yazılım ayrımı şema ile açıklanmalıdır.',
    text: 'Mimari şema Bölüm 3\'te verilmiş ve bileşenler arası veri akışı okunabilir. Görev yönetim katmanının hangi donanımda koştuğu şemada işaretlenirse bölüm eksiksiz olur.',
  },
  {
    code: 'K-04', title: 'Test ve Doğrulama', status: 'missing', origin: 'ai', ref: 'BÖLÜM 4',
    beklenti: 'Her alt sistem için test senaryosu, başarı ölçütü ve elde edilen sonuç raporlanmalıdır.',
    text: 'Bölüm 4\'te test senaryoları listelenmiş ancak hiçbiri için sayısal başarı ölçütü tanımlanmamış ve saha testi sonucu paylaşılmamış. Bu kriter mevcut haliyle karşılanmıyor.',
  },
  {
    code: 'K-05', title: 'Zaman Planı ve Bütçe', status: 'partial', origin: 'ai', ref: 'BÖLÜM 5.3',
    beklenti: 'Gantt planı ve kalem bazlı bütçe, tedarik riskleriyle birlikte sunulmalıdır.',
    text: 'Zaman planı verilmiş; bütçede motor ve batarya kalemleri tek satırda toplanmış. Tedarik süresi uzun olan kalemlerin ayrıştırılması riskin görünür olmasını sağlar.',
  },
  {
    code: 'K-06', title: 'Sonuç ve Kaynakça', status: 'done', origin: 'hakem', ref: 'BÖLÜM 6',
    beklenti: 'Sonuç bölümü hedeflerle karşılaştırmalı olmalı, kaynakça tek bir atıf formatında verilmelidir.',
    text: 'Sonuç bölümü hedeflerle birebir karşılaştırılmış, kaynakça IEEE formatında tutarlı. Bu kriterde ek bir düzeltme gerekmiyor.',
  },
];


/** Şu an giriş yapmış hakem — auth gelene kadar sabit. */
export const CURRENT_JUDGE = { name: 'Zeynep Demir', initials: 'ZD', role: 'HAKEM', stampedAt: '11:24' };

// ─────────────────────────────────────────────────────────────
// Yarışmacı geri bildirimi (PLAN.md §4.6 — feedback.content)
// ─────────────────────────────────────────────────────────────

export const FEEDBACK_HEADER = {
  title: 'Ön Tasarım Raporu değerlendirmeniz hazır',
  team: 'GARO',
  category: 'Sabit Kanat',
  reportNo: 'R-2026-0184',
  verdict: 'Kabul',
  date: '14.03.2026',
};

export const STRENGTHS = [
  { title: 'Problem tanımı ölçülebilir', text: 'Mevcut sistemin 4,2 sn tepki süresini gerekçe göstermeniz, problemi somut ve doğrulanabilir kılıyor.' },
  { title: 'Sistem mimarisi okunabilir', text: 'Bileşenler arası veri akışı şemada net; donanım-yazılım ayrımı doğru kurgulanmış.' },
  { title: 'Sonuç bölümü hedeflerle uyumlu', text: 'Ulaşılan sonuçlar başta konan hedeflerle birebir karşılaştırılmış, kaynakça tutarlı.' },
];

export const IMPROVEMENTS = [
  { title: 'Test başarı ölçütleri eksik', text: 'Test senaryolarınız kurgulanmış ancak sayısal başarı ölçütü tanımlanmamış. Her senaryoya bir eşik değer ve saha sonucu ekleyin.' },
  { title: 'Literatür güncellenmeli', text: 'Kaynakların dördü 2019 öncesi. Son iki yıla ait en az iki çalışma ekleyip farkınızı bir tabloyla gösterin.' },
  { title: 'Bütçe kalemleri ayrıştırılmalı', text: 'Motor ve batarya tek satırda toplanmış; tedarik süresi uzun kalemleri ayırmak riski görünür kılar.' },
];

// ─────────────────────────────────────────────────────────────
// Yarışma kurulumu (PLAN.md §6 /admin/competitions)
// ─────────────────────────────────────────────────────────────

export const SETUP_STEPS = [
  ['1', 'Yarışma bilgileri'],
  ['2', 'Şablon ve kriterler'],
  ['3', 'Hakem ataması'],
] as const;

export const CRITERIA_LIST = [
  { code: 'K-01', title: 'Problem Tanımı', weight: '%15' },
  { code: 'K-02', title: 'Literatür ve Özgünlük', weight: '%20' },
  { code: 'K-03', title: 'Yöntem ve Sistem Mimarisi', weight: '%25' },
  { code: 'K-04', title: 'Test ve Doğrulama', weight: '%20' },
  { code: 'K-05', title: 'Zaman Planı ve Bütçe', weight: '%10' },
  { code: 'K-06', title: 'Sonuç ve Kaynakça', weight: '%10' },
];

export const DEFAULT_SIMILARITY_THRESHOLD = 62;

// ─────────────────────────────────────────────────────────────
// Değerlendirme Yöneticisi panosu (PLAN.md §6 /evaluation)
// ─────────────────────────────────────────────────────────────

export const DASH_STATS = [
  { label: 'TOPLAM RAPOR', value: '412', tone: 'ink' as const, note: '38 takım · 6 kategori' },
  { label: 'AI ANALİZİ TAMAM', value: '389', tone: 'teal' as const, note: '23 rapor kuyrukta' },
  { label: 'HAKEM ONAYI BEKLEYEN', value: '146', tone: 'gold' as const, note: 'Ortalama bekleme 1,4 gün' },
  { label: 'YAYINLANAN SONUÇ', value: '243', tone: 'success' as const, note: 'Yarışmacılara iletildi' },
];

export type QueueRow = {
  team: string; code: string; judge: string; pct: number; progress: string;
  badge: string; tone: 'gold' | 'teal' | 'muted' | 'danger';
};

export const DASH_QUEUE: QueueRow[] = [
  { team: 'ATMACA', code: 'R-0179', judge: 'Z. Demir', pct: 100, progress: '6/6', badge: 'ONAYLANDI', tone: 'gold' },
  { team: 'GARO', code: 'R-0184', judge: 'Z. Demir', pct: 33, progress: '2/6', badge: 'İNCELEMEDE', tone: 'teal' },
  { team: 'RÜZGÂR', code: 'R-0188', judge: 'M. Kaya', pct: 0, progress: '0/6', badge: 'KUYRUKTA', tone: 'muted' },
  { team: 'PUSAT', code: 'R-0191', judge: 'M. Kaya', pct: 0, progress: '0/6', badge: 'KUYRUKTA', tone: 'muted' },
  { team: 'SİMURG', code: 'R-0196', judge: 'Atanmadı', pct: 0, progress: '0/6', badge: 'DİKKAT', tone: 'danger' },
  { team: 'KIVILCIM', code: 'R-0203', judge: 'A. Yılmaz', pct: 66, progress: '4/6', badge: 'İNCELEMEDE', tone: 'teal' },
];

export const DASH_WORKLOAD = [
  { name: 'Zeynep Demir', count: '18 / 24', pct: 75 },
  { name: 'Mert Kaya', count: '22 / 24', pct: 92 },
  { name: 'Ayşe Yılmaz', count: '9 / 24', pct: 38 },
  { name: 'Baran Öztürk', count: '4 / 24', pct: 17 },
];

