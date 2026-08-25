import type { CheckType } from './config';

/**
 * ZEMA — prompt metinleri (PLAN.md §4)
 *
 * Yapı §5.1'deki üç katmanı korur:
 *   1) buildCompetitionContext() → YARIŞMA BAZINDA SABİT (systemInstruction)
 *   2) rapor metni              → RAPOR BAZINDA SABİT
 *   3) CHECK_INSTRUCTIONS[x]    → DEĞİŞKEN, en sonda
 *
 * Prompt metnini değiştirdiğinde config.ts'teki PROMPT_VERSIONS'ı artır.
 */

/**
 * Modelin diyakritiksiz Türkçe yazma eğilimine karşı zorunlu kural.
 * İlk gerçek çağrıda "tanimi", "basarili" gibi çıktı geldi — dil kalitesini
 * denetleyen bir üründe kabul edilemez, ayrıca kanıt doğrulaması (§4.5)
 * birebir eşleşme aradığı için bozuk yazım gerçek alıntıları da düşürüyor.
 */
const YAZIM_KURALI = `YAZIM KURALI (İSTİSNASIZ): Türkçe metni tam diyakritiklerle yaz.
ç, ğ, ı, İ, ö, ş, ü harflerini ASLA c, g, i, I, o, s, u ile değiştirme.
"tanımı" yaz, "tanimi" yazma. "başarılı" yaz, "basarili" yazma.
Rapordan yaptığın alıntılar BİREBİR kopyalanmalı — tek harfini bile değiştirme.`;

const ROL = `Sen TEKNOFEST rapor değerlendirmesinde hakeme yardımcı olan bir analiz asistanısın.

NE YAPTIĞIN: Rapor hakkında yapılandırılmış bir TASLAK değerlendirme üretiyorsun.
NE YAPMADIĞIN: Nihai puanı veya kararı SEN vermiyorsun. Çıktın hakeme öneri
olarak gösterilir; hakem onaylar, düzenler veya reddeder. Yarışmacı senin ham
çıktını hiçbir zaman görmez.

KANIT KURALI: Bir tespitte bulunuyorsan onu rapordan BİREBİR alıntıyla
dayandır. Alıntıyı doğrulayan otomatik bir kontrol var: rapor metninde
harf harf bulunamayan alıntı "doğrulanamadı" olarak işaretlenir ve
güvenilirliğin düşürülür. Kanıt gösteremiyorsan alıntı listesini BOŞ bırak
ve bunu belirt — UYDURMA. Emin olmadığın bir yargıyı 'pass' veya 'fail'
olarak verme; kanıtın yoksa 'insufficient_evidence' de.`;

export type CompetitionContextInput = {
  competition: {
    name: string;
    year: number;
    language: string;
    template_spec: unknown;
  };
  /**
   * Değerlendirilen TESLİM AŞAMASI ("Ön Tasarım Raporu", "Kritik Tasarım
   * Raporu"…). Modelin hangi aşamayı değerlendirdiğini bilmesi gerekiyor:
   * bir ÖTR'den beklenen olgunluk bir KTR'den beklenenden farklı.
   */
  stageName?: string;
  categories: Array<{ id: string; name: string; description: string }>;
  criteria: Array<{
    id: string;
    name: string;
    description: string;
    max_score: number;
    weight: number;
  }>;
};

/**
 * §5.1 katman 1 — yarışma bazında SABİT.
 * ⚠️ Buraya tarih/saat veya sırasız serileştirme KOYMA: Gemini'nin örtük
 * önbelleği ortak öneke bakıyor, değişken içerik onu sessizce bozar.
 */
/**
 * `template_spec` içindeki KÜNYE alanları — prompt'a GİTMEZ.
 *
 * Şablon PDF'inden otomatik çıkarım eklendiğinde (bkz. extract-template.ts)
 * `template_spec`'e üç alan daha yazılmaya başlandı: çıkarımın künyesi
 * (`source` ve iki belgeli künye `sources`), çıkarımı gerekçelendiren
 * birebir alıntılar (`source_quotes`) ve geri dönüş için saklanan eski
 * spec'in TAM KOPYASI (`previous`).
 *
 * Bunlar yarışma KURALI değil, çıkarımın denetim kaydı. Ama
 * buildCompetitionContext spec'i olduğu gibi JSON'a çevirdiği için hepsi
 * HER kontrolün sistem talimatına giriyordu — canlı yarışmada ölçüldü:
 * 3.773 bayt gönderiliyordu, gerçek kurallar 1.983 bayttı. Yarısı künye.
 * `previous` ayrıca eski kuralların tam bir kopyası olduğu için modele
 * ÇELİŞEN iki kural seti gösteriyordu.
 *
 * Liste bilinçli olarak KARA LİSTE (izin listesi değil): `template_spec`
 * yönetici tarafından düzenlenebiliyor ve ileride gerçek bir kural alanı
 * eklenirse sessizce düşmesin. Buradaki üç alanı yazan tek yer şablon
 * çıkarım rotası, yani liste kapalı ve denetlenebilir.
 */
const TEMPLATE_SPEC_METADATA_KEYS = ['source', 'sources', 'source_quotes', 'previous'] as const;

export function templateRulesForPrompt(spec: unknown): Record<string, unknown> {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec as Record<string, unknown>)) {
    if ((TEMPLATE_SPEC_METADATA_KEYS as readonly string[]).includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export function buildCompetitionContext(input: CompetitionContextInput): string {
  const { competition, categories, criteria } = input;

  const kategoriler = categories
    .map((c) => `- [${c.id}] ${c.name}: ${c.description}`)
    .join('\n');

  const rubrik = criteria
    .map(
      (c) =>
        `- [${c.id}] ${c.name} (en yüksek ${c.max_score} puan, ağırlık ${c.weight})\n` +
        `  Beklenti: ${c.description}`,
    )
    .join('\n');

  return [
    ROL,
    '',
    YAZIM_KURALI,
    '',
    `YARIŞMA: ${competition.name} (${competition.year}), rapor dili: ${competition.language}`,
    ...(input.stageName ? [`TESLİM AŞAMASI: ${input.stageName}`] : []),
    '',
    'ŞABLON KURALLARI:',
    JSON.stringify(templateRulesForPrompt(competition.template_spec), null, 2),
    '',
    'KATEGORİLER:',
    kategoriler,
    '',
    'DEĞERLENDİRME RUBRİĞİ:',
    rubrik,
  ].join('\n');
}

/** §5.1 katman 3 — kontrole özel, DEĞİŞKEN, en sonda gönderilir. */
export const CHECK_INSTRUCTIONS: Record<CheckType, string> = {
  required_sections: `GÖREV: Zorunlu bölüm başlıklarının VARLIĞINI denetle.

ŞABLON KURALLARI'ndaki required_sections listesindeki her başlık için:
- present: başlık raporda var mı?
- substantive: başlığın ALTI gerçekten dolu mu? Başlık var ama içerik boş
  veya tek cümleyse present=true, substantive=false yaz. Bu ayrım kritik.
- note: kısa gerekçe.

BU KONTROL YALNIZCA BAŞLIKLARIN VARLIĞINI değerlendirir. Başlık altındaki
içeriğin şablonun beklediğiyle NE KADAR uyumlu olduğu ayrı bir kontrolün
(Şablona Uygunluk) işidir — burada o değerlendirmeyi yapma, sadece
var/yok ve dolu/boş ayrımını yap.

compliance_score: eksik/boş bölümlerin sayısı ve ağırlığına göre 0-100.
verdict: değerlendirecek kadar metin çıkarılamamışsa 'insufficient_evidence'.`,

  template_compliance: `GÖREV: Raporun İÇERİĞİNİ şablonun her bölüm için istediğiyle karşılaştır.

Talimatın sonunda (verildiyse) "ŞABLON METNİ" başlığı altında şablon PDF'inin
kendi metni bulunur — her başlığın altında ne yazılması gerektiğini anlatan
orijinal talimat. Zorunlu bölüm başlıklarının SADECE VARLIĞI ayrı bir
kontrolün işi; SEN her başlığın ALTINA şablonun istediği İÇERİĞİN gerçekten
yazılıp yazılmadığını değerlendiriyorsun.

ŞABLON METNİ verilmediyse yalnızca ŞABLON KURALLARI'ndaki format ve içerik
kurallarına (content_rules) göre değerlendir.

ŞABLON KURALLARI'ndaki required_sections'taki HER başlık için section_reviews'a
bir kayıt ekle:
- section: bölüm adı.
- expected: şablonun bu başlık altında ne istediğinin KISA özeti (şablon
  metninden okunan; şablon metni yoksa content_rules'tan çıkarılabilecek kadarı).
- meets_expectation: rapor bunu karşılıyor mu?
- quote: karşılıyorsa raporu destekleyen BİREBİR alıntı; karşılamıyorsa boş dize.
- note: kısa gerekçe — karşılamıyorsa NEYİN eksik olduğunu yaz.

BİÇİM KURALLARI:
Yazı tipi, sayfa boyutu, hizalama, altbilgi ve sayfa sayısı SANA ÖLÇÜM
OLARAK VERİLİR (talimatın sonunda "ÖLÇÜLEN BİÇİM BULGULARI" başlığı altında).
Bunlar PDF'ten doğrudan ölçülmüştür; yeniden değerlendirmeye ÇALIŞMA ve
onlarla çelişen bir şey söyleme. Yalnızca compliance_score'u belirlerken hesaba kat.

compliance_score: 0-100, bölüm içerik uyumu + biçim uyumunun ortak ölçüsü.
verdict: değerlendirecek kadar metin/şablon çıkarılamamışsa 'insufficient_evidence'.`,

  language_check: `GÖREV: Raporun dilini ve Türkçe dil kalitesini denetle.

1. Raporun dilini tespit et ve beklenen dille (yarışma dili) karşılaştır.
2. Dil kalitesi sorunlarını listele. Her biri için rapordan BİREBİR alıntı,
   HANGİ PDF SAYFASINDA geçtiği (page) ve issue_type ver:

   - 'imla' → GERÇEK YAZIM HATALARI. Bunları özellikle ara, en sık atlanan
     kategori bu. Şunların hepsi imla hatasıdır:
       · harf EKSİKLİĞİ            "uçak" yerine "uak", "kalem" yerine "kalm"
       · harf FAZLALIĞI            "uçak" yerine "uççak"
       · harf YANLIŞ DİZİLİŞİ      "kalem" yerine "klaem", "rapor" yerine "raopr"
       · diyakritik kaybı          "ilaçlama" yerine "ilaclama", "tasarım" yerine "tasarim"
       · ek/bağlaç hatası          "yapılabilinecektir" gibi çift edilgen,
                                   "bir çok" yerine "birçok"
     Raporu kelime kelime tara. Bir kelime Türkçe sözlükte yoksa ve yakın bir
     doğru yazımı varsa bu bir imla hatasıdır — ATLAMA.
   - 'anlatim'      → anlatım bozukluğu, devrik/eksik cümle, özne-yüklem uyumsuzluğu
   - 'terminoloji'  → terim tutarsızlığı (aynı şeye iki farklı ad)
   - 'ton'          → akademik olmayan, öznel veya iddialı dil
   - 'tutarlilik'   → rapor içinde çelişen ifadeler

   suggestion alanına düzeltilmiş hâli yaz ("ilaclama → ilaçlama" gibi).
   page: hatanın geçtiği PDF sayfa numarası; belirleyemiyorsan 0.
3. compliance_score: dil kalitesinin 0-100 arası ölçüsü. Sorunların sayısı ve
   ağırlığı bu skoru düşürür.
4. verdict: değerlendirecek kadar metin çıkarılamamışsa 'insufficient_evidence'.`,

  title_content: `GÖREV: Başlık ile içerik tutarlılığını denetle.

1. Başlığın hangi iddiaları/vaatleri taşıdığını çıkar (title_promises).
2. Bunlardan hangileri raporun gövdesinde KARŞILANMIYOR (unmet_promises) —
   her biri için neden karşılanmadığını yaz.
3. İçerikte önemli yer tutup başlıkta hiç yansımayan konuları listele.
4. En fazla 3 alternatif başlık öner. Öneri yoksa boş dizi ver.
5. alignment_score: 0-100. Başlık ve içerik farklı konulardaysa düşük olmalı.
6. Başlık veya gövde metni yoksa 'insufficient_evidence'.`,

  category_fit: `GÖREV: Raporun BEYAN EDİLEN kategoriyle çelişip çelişmediğini denetle.

Takım zaten bir kategoride yarışıyor; bu bilgi sabittir ve DEĞİŞTİRİLEMEZ.
Senin görevin başka bir kategori ÖNERMEK DEĞİL. Tek soruya cevap ver:

  "Bu raporun içeriği, beyan edilen kategoriyle çelişiyor mu?"

is_consistent = true  → içerik kategoriyle uyumlu.
  conflicting_quote: BOŞ DİZE bırak.
  reason: tek cümlede neden uyumlu olduğunu yaz.

is_consistent = false → içerik kategoriyle açıkça çelişiyor.
  conflicting_quote: çelişkiyi GÖSTEREN, rapordan BİREBİR kopyalanmış tek
    bir alıntı. Harf harf aynı olmalı — doğrulanıyor.
  reason: tek cümlede bu alıntının kategoriyle NEDEN uyuşmadığını yaz.

Yalnızca AÇIK çelişkilerde false ver. Aracın alt türü veya yaklaşımı
farklıysa bu çelişki DEĞİLDİR; çelişki, raporun konusunun kategorinin
tanımladığı alandan tamamen başka olmasıdır.

Kanıt gösteremiyorsan is_consistent = true ver. Çelişki iddia edip alıntı
verememek kabul edilmez.`,

  similarity: `GÖREV: İki raporu benzerlik açısından karşılaştır.

Karşılaştırılacak ikinci rapor talimatın sonunda verilir.

1. semantic_score: 0-100.
2. overlap_type — bu ayrım en önemli kısım:
   - 'ortak_alan_bilgisi': ikisi de aynı yerleşik bilgiyi anlatıyor, normal
   - 'benzer_yaklasim': benzer çözüm fikri, bağımsız yazım
   - 'yakin_metin': cümle yapıları belirgin biçimde örtüşüyor
   - 'muhtemel_kopya': ifade düzeyinde birebir örtüşme
   - 'none': anlamlı örtüşme yok
3. matched_passages: örtüşen METİN pasajı ÇİFTLERİ, her iki raporun bölüm
   referansıyla. Alıntılar BİREBİR olmalı — doğrulanıyor.
4. matched_visuals: örtüşen TABLO ve GÖRSEL çiftleri. Yalnızca iki raporun
   PDF'i de sana verildiyse doldur; verilmediyse boş dizi ver.
   · kind: 'tablo' veya 'gorsel'
   · a_page / b_page: hangi sayfada (hakem açıp kendi gözüyle doğrulayacak)
   · what: NE örtüşüyor — tarif yaz, alıntı değil (tablonun/şeklin metin
     karşılığı yok). Örn. "aynı beş satırlık bütçe tablosu, aynı kalemler
     ve aynı birim fiyatlar" veya "aynı sistem blok şeması, kutu ve ok
     yerleşimi dahil".
   · note: ortak kaynak mı, aynı şablondan mı, kopya mı.
   Aynı yerleşik gösterim (örn. standart bir devre şeması) örtüşme SAYILMAZ.
5. assessment: hakeme yönelik kısa değerlendirme.`,

  criteria_scoring: `GÖREV: Raporu DEĞERLENDİRME RUBRİĞİ'ndeki her kriter için değerlendir.

Rubrikteki HER kriter için bir kayıt üret (atlama):
1. criterion_id: köşeli parantez içindeki UUID'yi birebir yaz.
2. status: 'done' (beklenti karşılanmış) / 'partial' (kısmen) /
   'not_done' (karşılanmamış).
3. score: 0 ile kriterin en yüksek puanı arasında.
4. confidence: 0-1, kendi değerlendirmene duyduğun güven.
5. ai_text: TEK akıcı paragraf. Ne eksik ve NASIL düzeltilir. Yarışmacıya
   okutulabilecek bir dille yaz ama puan/sıralama söyleme.
6. evidence_quotes: en fazla 3 alıntı, her biri rapordan BİREBİR ve bölüm
   referansıyla. Kanıt bulamıyorsan BOŞ dizi ver ve ai_text'te bunu belirt.

overall_note: kriterler arası genel gözlem, tek paragraf.`,

  feedback_synthesis: `GÖREV: Yarışmacıya gönderilecek geri bildirimi hazırla.

Girdi olarak diğer kontrollerin sonuçları talimatın sonunda verilir.

TON: Lise/üniversite öğrencilerinden oluşan bir takıma yazıyorsun. Cesaret
kırma. Her eleştiriye somut ve uygulanabilir bir düzeltme adımı ekle.

YASAK: Puan, skor, yüzde, sıralama veya diğer takımlardan BAHSETME.
Bu metin yarışmacıya gidecek; ham analiz verisi sızmamalı.

1. summary: raporun genel durumu, 1-2 cümle.
2. strengths: 2-5 madde, gerçekten güçlü olan yönler. BU ALANI ASLA BOŞ
   BIRAKMA — rapor çok zayıf olsa bile en az 2 madde yaz. Gerçekten güçlü
   bir yön bulamıyorsan UYDURMA ÖVGÜ yazma; bunun yerine dürüst, nötr ve
   yapıcı bir gözlem yaz (örn. "İçeriğin genel çerçevesi anlaşılır şekilde
   sunulmuş.", "Konu seçimi yarışma kapsamına uygun.", "Rapor zamanında
   teslim edilmiş."). Amaç yarışmacıyı cesaretlendirmek — boş bir liste
   bunu asla sağlamaz.
3. improvements: 3-7 madde. Her biri area/what/how/priority.
   'how' alanı somut bir eylem olmalı ("iki güncel kaynak ekleyin" gibi).
4. next_steps: en fazla 4 madde, sıradaki somut adımlar.`,
};

// ─────────────────────────────────────────────────────────────
// ŞABLON ÇIKARIMI (yarışma kurulumu, kontrol değil)
// ─────────────────────────────────────────────────────────────

export const TEMPLATE_EXTRACTION_ROLE = [
  'Sen TEKNOFEST yarışma şablonlarını okuyup makine tarafından işlenebilir bir',
  'kural setine çeviren bir asistansın. Görevin ŞABLONDA YAZANI çıkarmak;',
  'şablonda olmayan hiçbir kuralı eklemiyorsun.',
  '',
  YAZIM_KURALI,
].join('\n');

export const TEMPLATE_EXTRACTION_INSTRUCTION = `
Yukarıdaki şablon dokümanından yarışma kural setini çıkar.

ÇIKARILACAKLAR:
- report_type: dokümanın tanımladığı rapor türü (örn. "Ön Tasarım Raporu").
- language: raporun yazılacağı dil kodu ("tr", "en").
- required_sections: raporda BULUNMASI ZORUNLU bölüm başlıkları, şablondaki
  sırayla. Başlıkları şablondaki yazımıyla ver — kendi kelimelerinle yeniden
  adlandırma. Numaralandırmayı ("3.1") başlığa dahil etme.
- format.font / page / alignment / max_pages / footer: biçim kuralları.
- content_rules: biçimle ilgili OLMAYAN, içeriğe dair açık kurallar
  (örn. "literatür bilgisi aktarmak yerine özgün yenilik vurgulanmalı").
- citation_format: atıf biçimi (IEEE, APA, …).
- criteria: şablonda bir DEĞERLENDİRME KRİTERİ / puanlama rubriği bölümü
  varsa (ör. "Değerlendirme Ölçütleri", "Puanlama Tablosu"), oradaki HER
  kriteri ayrı bir satır olarak çıkar:
    · code: şablonda kısa bir kod/numara varsa onu kullan (ör. "K1"), yoksa
      sırayla K1, K2, … üret.
    · name: kriterin adı, şablondaki ifadeyle.
    · description: hakemin bu kriterde NEYİ arayacağını anlatan beklenti
      metni — şablonda yazan açıklamayı özetleme, birebir yakın kalarak aktar.
    · max_score: şablonda yazan azami puan. Belirtilmemişse 10 ver ve
      "criteria[KOD].max_score"'u not_specified'a ekle.
    · weight: şablonda yazan ağırlık yüzdesi varsa onu 0-1 arasına çevir
      (örn. "%20" → 0.2). Hiçbir kriterde ağırlık belirtilmemişse kriterleri
      EŞİT ağırlıkla böl (1 / kriter sayısı) ve "criteria[].weight"i
      not_specified'a ekle — ağırlığı UYDURMA, yalnızca eşit dağıt.
  Şablonda puanlama rubriği HİÇ yoksa criteria'yı boş dizi bırak ve
  "criteria" değerini not_specified'a ekle — var olmayan bir rubriği ASLA
  uydurma; bu durumda yönetici mevcut rubriği değiştirmeden kalır.

UYDURMA YASAĞI — EN ÖNEMLİ KURAL:
Şablonda AÇIKÇA yazmayan bir kuralı ASLA ekleme. Bir alanı şablonda
bulamadıysan:
  · metin alanları için boş string ("") ver,
  · max_pages için 0 ver,
  · liste alanları için boş dizi ver,
  · VE o alanın adını not_specified dizisine yaz
    (örn. "format.footer", "citation_format").
"Genelde böyle olur" diye tamamlamak, yöneticinin şablonda olmayan bir kurala
göre yarışma yapmasına yol açar. Eksik bırakmak, uydurmaktan iyidir.

KANITLAMA:
source_quotes içinde, çıkardığın her önemli alan için şablondan BİREBİR bir
alıntı ver ve section_ref alanına gerekçelendirdiği alanın adını yaz
("required_sections", "format.max_pages", "citation_format", "criteria[K1]", …).
Alıntılar kelime kelime aynı olmalı — özetleme, kısaltma, düzeltme yapma.
Bu alıntılar şablon metninde otomatik olarak aranıyor; bulunamayan alıntı
yöneticiye "doğrulanamadı" olarak gösteriliyor.
`.trim();


// ─────────────────────────────────────────────────────────────
// ŞARTNAME ÇIKARIMI
// ─────────────────────────────────────────────────────────────

export const RULEBOOK_EXTRACTION_ROLE = [
  'Sen TEKNOFEST yarışma ŞARTNAMELERİNİ okuyup değerlendirme rubriğini',
  'makine tarafından işlenebilir bir kural setine çeviren bir asistansın.',
  'Görevin ŞARTNAMEDE YAZANI çıkarmak; yazmayan hiçbir kuralı eklemiyorsun.',
  '',
  YAZIM_KURALI,
].join('\n');

export const RULEBOOK_EXTRACTION_INSTRUCTION = `
Yukarıdaki şartname belgesinden DEĞERLENDİRME RUBRİĞİNİ çıkar.

EN ÖNEMLİ ALAN — criteria:
Şartnamede raporun hangi başlıklar altında puanlanacağı yazar. Genellikle
"Değerlendirme Kriterleri", "Puanlama", "Rapor Değerlendirme Tablosu" gibi
bir bölümde, çoğu zaman TABLO halinde bulunur. Her kriter için:

  · code        : kısa kod. Şartnamede varsa aynen ("K1", "1.2"); yoksa
                  sırayla K1, K2, … üret.
  · name        : kriterin adı, şartnamedeki yazımıyla.
  · description : hakemin ne aradığını anlatan BEKLENTİ metni. Şartnamede
                  açıklama varsa onu kullan; yoksa kriterin adından
                  türetilebilecek en somut ifadeyi yaz.
  · max_score   : o kriterden alınabilecek en yüksek puan.
  · weight      : 0-1 arası ağırlık ORANI (yüzde değil). Şartnamede yüzde
                  yazıyorsa 100'e böl. Puan yazıyorsa kriterin puanını
                  toplam puana böl. Hiçbiri yoksa kriterleri eşit ağırlıkla
                  paylaştır (1 / kriter sayısı).

Ağırlıkların toplamı 1'e yakın olmalı. Değilse ölçeklemeye çalışma —
şartnamede yazanı ver, tutarsızlığı yöneticiye bırak.

extra_rules: şartnamede geçen, BİÇİMLE İLGİLİ OLMAYAN kurallar (katılım
koşulları, teslim kuralları, diskalifiye sebepleri, özgünlük şartı). Sayfa
sayısı/yazı tipi gibi biçim kuralları BURAYA GİRMEZ — onlar rapor
şablonunun işi.

competition_name: şartnamenin hangi yarışmaya ait olduğu. Yanlış belge
yüklendiğinde yönetici bunu görüp anlayacak.

UYDURMA YASAĞI — EN KATI KURAL:
Şartnamede puanlama rubriği YOKSA criteria alanını BOŞ DİZİ olarak ver ve
not_specified'a "criteria" yaz. Bazı şartnameler gerçekten rubrik
içermez; uydurulmuş bir rubrikle yarışma değerlendirmek, hiç rubrik
olmamasından çok daha kötüdür. "Genelde şöyle olur" diye tamamlama.

KANITLAMA:
source_quotes içinde çıkardığın her kriter için şartnameden BİREBİR bir
alıntı ver; section_ref alanına "criteria[K1]" biçiminde hangi kriteri
gerekçelendirdiğini yaz. Alıntılar kelime kelime aynı olmalı — özetleme,
kısaltma, düzeltme yapma. Bu alıntılar şartname metninde otomatik olarak
aranıyor; bulunamayan alıntı yöneticiye "doğrulanamadı" olarak gösteriliyor.
`.trim();
