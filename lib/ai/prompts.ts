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
    '',
    'ŞABLON KURALLARI:',
    JSON.stringify(competition.template_spec, null, 2),
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
  language_template: `GÖREV: Dil ve şablon uyumunu denetle.

1. Raporun dilini tespit et ve beklenen dille (yarışma dili) karşılaştır.
2. ŞABLON KURALLARI'ndaki zorunlu bölümlerin her biri için:
   - present: başlık var mı?
   - substantive: başlığın ALTI gerçekten dolu mu? Başlık var ama içerik boş
     veya tek cümleyse present=true, substantive=false yaz. Bu ayrım kritik.
3. Türkçe dil kalitesi sorunlarını listele. Her biri için rapordan BİREBİR
   alıntı ver ve issue_type alanını şu şekilde kullan:

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
4. compliance_score: şablon uyumunun 0-100 arası ölçüsü. Eksik veya içi boş
   zorunlu bölümler ile dil sorunlarının sayısı ve ağırlığı bu skoru düşürür.
   İçerik kurallarına (özgün yenilik vurgusu, tekrarlayan cümle) uyulmaması
   da skora yansır.
5. verdict: kanıtla desteklenen genel sonuç. Şablonu değerlendirecek kadar
   metin çıkarılamamışsa 'insufficient_evidence'.`,

  title_content: `GÖREV: Başlık ile içerik tutarlılığını denetle.

1. Başlığın hangi iddiaları/vaatleri taşıdığını çıkar (title_promises).
2. Bunlardan hangileri raporun gövdesinde KARŞILANMIYOR (unmet_promises) —
   her biri için neden karşılanmadığını yaz.
3. İçerikte önemli yer tutup başlıkta hiç yansımayan konuları listele.
4. En fazla 3 alternatif başlık öner. Öneri yoksa boş dizi ver.
5. alignment_score: 0-100. Başlık ve içerik farklı konulardaysa düşük olmalı.
6. Başlık veya gövde metni yoksa 'insufficient_evidence'.`,

  category_fit: `GÖREV: Raporun kategori uygunluğunu denetle.

1. KATEGORİLER listesindeki açıklamalara bakarak raporu sınıflandır.
   En uygun 3 kategoriyi güven değeriyle (0-1) sırala. category_id alanına
   köşeli parantez içinde verilen UUID'yi birebir yaz.
2. declared_category_confidence: yarışmacının BEYAN ETTİĞİ kategorinin ne
   kadar uygun olduğu (beyan edilen kategori talimatın sonunda verilir).
3. is_mismatch: beyan edilen kategori açıkça yanlışsa true.
4. recommendation: hakeme tek cümlelik öneri.
Raporun konusu anlaşılamıyorsa ranked_categories'i boş bırak.`,

  similarity: `GÖREV: İki raporu benzerlik açısından karşılaştır.

Karşılaştırılacak ikinci rapor talimatın sonunda verilir.

1. content_type: benzerliğin yoğunlaştığı içerik türü (metin/tablo/gorsel).
2. semantic_score: 0-100.
3. overlap_type — bu ayrım en önemli kısım:
   - 'ortak_alan_bilgisi': ikisi de aynı yerleşik bilgiyi anlatıyor, normal
   - 'benzer_yaklasim': benzer çözüm fikri, bağımsız yazım
   - 'yakin_metin': cümle yapıları belirgin biçimde örtüşüyor
   - 'muhtemel_kopya': ifade düzeyinde birebir örtüşme
   - 'none': anlamlı örtüşme yok
4. matched_passages: örtüşen pasaj ÇİFTLERİ, her iki raporun bölüm
   referansıyla. Benzerlik iddia ediyorsan bu liste BOŞ OLMAMALI.
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
2. strengths: 2-5 madde, gerçekten güçlü olan yönler.
3. improvements: 3-7 madde. Her biri area/what/how/priority.
   'how' alanı somut bir eylem olmalı ("iki güncel kaynak ekleyin" gibi).
4. next_steps: en fazla 4 madde, sıradaki somut adımlar.`,
};
