/**
 * §9 demo veri seti — KUSURLARI PLANLI raporlar.
 *
 * ⚠️ ÖNEMLİ TASARIM KURALI: Ortak bölümler SABİT METİN OLARAK PAYLAŞILMAZ.
 * İlk denemede paylaşılmıştı ve dokuz raporun hepsi birbirine %80-99 benzer
 * çıktı — model doğru çalışıyordu, veri yanlıştı. Artık her bölüm rapora
 * özgü sayılardan/ifadelerden üretiliyor; yalnızca R5 ve R6 bilinçli olarak
 * BİREBİR aynı paragrafı taşıyor (benzerlik kontrolünün demo hedefi).
 */
export type DemoReport = {
  key: string;
  team: string;
  title: string;
  category: 'Sabit Kanat' | 'Döner Kanat' | 'Serbest Görev';
  triggers: string;
  sections: Array<[string, string]>;
};

/** Rapora özgü sayılar — paragrafları birbirinden ayıran şey. */
type Params = {
  domain: string; user: string; metric: string;
  before: string; after: string; unit: string;
  lit: [string, string, string];
  novelty: string;
  arch: string;
  tests: [string, string, string];
  budget: [string, string, string];
  goals: string;
};

const problem = (p: Params) =>
  [`1.2 Problem Tanımı`,
   `${p.domain} alanında ${p.metric} ortalama ${p.before} ${p.unit} seviyesindedir. ` +
   `Sahada yapılan ölçümlerde bu değerin yoğun dönemlerde daha da yükseldiği görülmüştür. ` +
   `Hedef kullanıcı ${p.user}. Projemizin amacı bu değeri ${p.after} ${p.unit} seviyesine indirmektir.`
  ] as [string, string];

const literature = (p: Params) =>
  [`2.1 Literatür ve Özgünlük`,
   `${p.lit[0]} (2024) ${p.lit[1]}; ayrıca ${p.lit[2]} konusunda 2025 tarihli bir çalışma ` +
   `incelenmiştir. Toplam yedi güncel kaynak taranmıştır. Çalışmamızın bunlardan farkı ${p.novelty} ` +
   `olmasıdır; karşılaştırma Tablo 2.1'de verilmiştir.`
  ] as [string, string];

const architecture = (p: Params) => [`3. Yöntem ve Sistem Mimarisi`, p.arch] as [string, string];

const tests = (p: Params) =>
  [`4. Test ve Doğrulama`,
   `Her alt sistem için sayısal başarı ölçütü tanımlanmıştır. ${p.tests[0]} ${p.tests[1]} ${p.tests[2]} ` +
   `Ölçümler saha koşullarında tekrarlanmış ve kayıt altına alınmıştır.`
  ] as [string, string];

const budget = (p: Params) =>
  [`5. Zaman Planı ve Bütçe`,
   `Tasarım, prototipleme, entegrasyon ve saha testi fazları sırasıyla planlanmıştır. Bütçe kalem ` +
   `bazlı verilmiştir: ${p.budget[0]}, ${p.budget[1]}, ${p.budget[2]}. Tedarik süresi uzun olan ` +
   `kalem için alternatif tedarikçi belirlenmiştir.`
  ] as [string, string];

const sonuc = (p: Params) => [`6. Sonuç`, p.goals] as [string, string];

const kaynakca = (p: Params) =>
  [`Kaynakça`,
   `[1] ${p.lit[0]}, "${p.lit[1]}", IEEE Trans., 2024. ` +
   `[2] ${p.lit[2]} üzerine TEKNOFEST Bildiriler Kitabı, 2025. ` +
   `[3] ${p.domain} için ölçüm standartları, TSE, 2023.`
  ] as [string, string];

const P = {
  R1: {
    domain: 'Şehir içi kargo teslimatı', user: 'aynı gün teslimat yapan kargo operatörleridir',
    metric: 'bir paketin depodan alıcıya ulaşma süresi', before: '47', after: '19', unit: 'dakika',
    lit: ['Zhang', 'rotor verimliliğini artıran bir pervane profili önermiştir', 'şehir içi rota optimizasyonu'],
    novelty: 'enerji tüketimi ile teslimat penceresini eşzamanlı optimize eden bir karar motoru sunması',
    arch: 'Araç dört rotorlu bir multikopterdir. Dikey kalkış sayesinde pist ihtiyacı yoktur. ' +
      'Uçuş kontrol kartı, karar motoru ve yük bırakma mekanizması ayrı modüller olarak tasarlanmış; ' +
      'aralarındaki veri akışı Şek. 3.1\'de gösterilmiştir. Rotor çapı 15 inç, gövde karbon fiberdir.',
    tests: ['Telemetri gecikmesi hedefi 60 ms altı, ölçülen 48 ms.', 'Havada kalma hedefi 22 dakika, ölçülen 24 dakika.', 'Konumlanma hassasiyeti hedefi 1,5 m, on tekrarda ortalama 0,9 m.'],
    budget: ['fırçasız motor 4 adet 12.400 TL', 'LiPo batarya 2 adet 5.800 TL', 'karbon gövde kiti 9.250 TL'],
    goals: 'Başta konan üç hedefin üçü de karşılanmıştır: teslimat süresi 47 dakikadan 19 dakikaya inmiş, ' +
      'km başına maliyet 4,80 TL\'den 1,60 TL\'ye gerilemiş, konumlanma hedefin altında kalmıştır.',
  },
  R2: {
    domain: 'Dikey inişli yük taşıma', user: 'ada ve kırsal yerleşimlere hizmet veren lojistik firmalarıdır',
    metric: 'pist gerektiren araçlarla erişilemeyen nokta oranı', before: '38', after: '9', unit: 'yüzde',
    lit: ['Nakamura', 'eğimli arazide iniş kararlılığını inceledi', 'yük dengeleme algoritmaları'],
    novelty: 'iniş yüzeyi eğimini gerçek zamanlı ölçüp itki dağılımını uyarlaması',
    arch: 'Platform altı rotorlu koaksiyel bir düzendedir. İniş takımı üç bağımsız amortisörle eğimli ' +
      'yüzeye uyum sağlar. Yük bölmesi gövde altına asılmış olup ağırlık merkezi otomatik dengelenir.',
    tests: ['Eğimli iniş başarı hedefi %90, ölçülen %94.', 'Maksimum yük hedefi 5 kg, taşınan 5,6 kg.', 'İniş sarsıntısı hedefi 2 g altı, ölçülen 1,4 g.'],
    budget: ['koaksiyel motor seti 18.900 TL', 'amortisörlü iniş takımı 4.200 TL', 'yük bölmesi gövdesi 7.100 TL'],
    goals: '', // KULLANILMIYOR — R2'de Sonuç bölümü kasten yok
  },
  R3: {
    domain: 'Sualtı kablo denetimi', user: 'liman işletmeleri ve denizaltı kablo bakım ekipleridir',
    metric: 'bir kablo hattının denetim süresi', before: '11', after: '4', unit: 'saat',
    lit: ['Ferrari', 'bulanık suda görüş mesafesini artıran filtreleme önerdi', 'sonar tabanlı hat takibi'],
    novelty: 'optik ve sonar verisini tek karar katmanında birleştirmesi',
    // ⚠️ KASITLI KUSUR: içerik tamamen HAVA aracı, başlık ise sualtı aracı
    arch: 'Araç dört rotorlu bir multikopterdir ve havada sabit kalarak görüntü toplar. Uçuş kontrol ' +
      'kartından gelen telemetri karar motoruna iletilir. Rotor çapı 15 inç, kalkış ağırlığı 6,4 kg, ' +
      'azami irtifa 400 metredir. Rüzgâr direnci 12 m/s\'ye kadar test edilmiştir.',
    tests: ['Görüntü çözünürlüğü hedefi 4K, sağlanan 4K.', 'Havada kalma hedefi 25 dakika, ölçülen 27 dakika.', 'Rüzgâr direnci hedefi 10 m/s, ölçülen 12 m/s.'],
    budget: ['rotor ve motor grubu 14.300 TL', 'kamera gimbal 8.600 TL', 'telemetri modülü 2.100 TL'],
    goals: 'Hedeflerin tamamı karşılanmıştır: uçuş süresi, görüntü kalitesi ve rüzgâr direnci ' +
      'başta belirlenen değerlerin üzerinde performans göstermiştir.',
  },
  R4: {
    domain: 'Kırsal sağlık hizmeti', user: 'aile sağlığı merkezlerinde görev yapan hekimlerdir',
    metric: 'kan tahlili sonucuna ulaşma süresi', before: '3,5', after: '0,1', unit: 'gün',
    lit: ['Okafor', 'mikroakışkan kartuş maliyetini düşüren bir kalıplama yöntemi geliştirdi', 'noktada tanı cihazlarının saha doğrulaması'],
    novelty: 'kartuşu tek kullanımlık hale getirerek çapraz kontaminasyonu tamamen ortadan kaldırması',
    arch: 'Cihaz bir mikroakışkan kartuş, optik okuyucu modül ve gömülü işlem biriminden oluşur. Kan ' +
      'numunesi kartuşa damlatıldıktan sonra kapiler akış reaksiyon odasına taşır; optik modül 520 nm ' +
      'dalga boyunda absorbans ölçer ve sonuç 90 saniyede ekranda görünür. Cihaz taşınabilir olup ' +
      'şebeke elektriği gerektirmez.',
    tests: ['Ölçüm doğruluğu hedefi ±5%, elde edilen ±3%.', 'Sonuç süresi hedefi 120 sn, ölçülen 90 sn.', 'Batarya ile ölçüm sayısı hedefi 40, ölçülen 52.'],
    budget: ['mikroakışkan kalıp seti 22.000 TL', 'optik okuyucu modül 9.400 TL', 'gömülü işlem kartı 3.300 TL'],
    goals: 'Üç hedefin üçü de karşılanmıştır: ölçüm doğruluğu, sonuç süresi ve batarya ömrü ' +
      'hedeflenen değerlerin üzerinde çıkmıştır.',
  },
  R5: {
    domain: 'Sürü halinde arama kurtarma', user: 'AFAD saha ekipleri ve itfaiye arama birimleridir',
    metric: 'bir hektarlık alanın taranma süresi', before: '55', after: '14', unit: 'dakika',
    lit: ['Rossi', 'sürü içi çakışma önlemeyi merkezi olmayan biçimde çözdü', 'mesh haberleşme gecikmesi'],
    novelty: 'ajan sayısı arttığında haberleşme yükünü sabit tutan bir yayın stratejisi kullanması',
    arch: 'ORTAK_MIMARI',
    tests: ['Ajan sayısı hedefi 6, test edilen 8.', 'Ayrım mesafesi hedefi 4 m, ölçülen minimum 4,3 m.', 'Tarama kapsama hedefi %92, ölçülen %96.'],
    budget: ['sürü ajanı gövde seti 6 adet 26.400 TL', '900 MHz mesh modülü 6 adet 5.100 TL', 'yer kontrol istasyonu 7.800 TL'],
    goals: 'Kapsama oranı, ajan sayısı ve ayrım mesafesi hedeflerinin üçü de karşılanmıştır.',
  },
  R6: {
    domain: 'Çoklu araç koordinasyonu', user: 'tarım kooperatifleri ve orman işletme müdürlükleridir',
    metric: 'çok araçlı görevde koordinasyon kaynaklı gecikme', before: '23', after: '6', unit: 'yüzde',
    lit: ['Lindqvist', 'görev paylaşımını açık artırma yöntemiyle modelledi', 'filo yönetim arayüzleri'],
    novelty: 'görev dağıtımını araç bataryası kalan kapasitesine göre yeniden planlaması',
    arch: 'ORTAK_MIMARI',
    tests: ['Eşzamanlı araç hedefi 4, test edilen 5.', 'Görev yeniden dağıtım süresi hedefi 3 sn, ölçülen 1,8 sn.', 'Batarya kaynaklı görev iptali hedefi %5 altı, ölçülen %2.'],
    budget: ['koordinasyon sunucusu 11.500 TL', 'araç haberleşme modülü 5 adet 4.250 TL', 'operatör arayüz lisansı 3.000 TL'],
    goals: 'Üç hedefin tamamı karşılanmıştır; özellikle görev yeniden dağıtım süresi hedefin yarısında kalmıştır.',
  },
  R7: {
    domain: 'Uzun menzilli sınır gözetleme', user: 'sınır güvenlik birimleri ve kıyı emniyetidir',
    metric: 'bir devriye turunun kapsadığı hat uzunluğu', before: '40', after: '138', unit: 'kilometre',
    lit: ['Petrov', 'yüksek en-boy oranlı kanat profillerini karşılaştırdı', 'uzun havada kalma için enerji yönetimi'],
    novelty: 'seyir irtifasını hava durumu tahminine göre uyarlayarak menzili artırması',
    arch: 'ZAYIF_MIMARI',
    tests: ['Menzil hedefi 120 km, ölçülen 138 km.', 'Havada kalma hedefi 4 saat, ölçülen 4 saat 25 dakika.', 'Kalkış mesafesi hedefi 90 m, ölçülen 74 m.'],
    budget: ['sabit kanat gövde ve kanat seti 31.000 TL', 'itki grubu 12.700 TL', 'gözetleme kamerası 15.200 TL'],
    goals: 'Başta konan dört hedefin dördü de karşılanmıştır: menzil hedefi 120 km iken 138 km, havada ' +
      'kalma hedefi 4 saat iken 4 saat 25 dakika, faydalı yük hedefi 3 kg iken 3,4 kg, kalkış mesafesi ' +
      'hedefi 90 m iken 74 m ölçülmüştür. Hedeflerle karşılaştırma Tablo 6.1\'de özetlenmiştir.',
  },
  R8: {
    domain: 'Tarımsal ilaçlama', user: 'orta ölçekli tarım işletmeleridir',
    metric: 'bir dekar alanın ilaçlanma süresi', before: '40', after: '11', unit: 'dakika',
    lit: ['Yıldız', 'damlacık boyutunun ilaç kaybına etkisini ölçtü', 'değişken oranlı ilaçlama'],
    novelty: 'ilaç debisini bitki yoğunluğuna göre anlık ayarlaması',
    arch: 'ZAYIF_YAZIM',
    tests: ['İlaç kaybı hedefi %15 altı, ölçülen %9.', 'Kapsama düzgünlüğü hedefi %85, ölçülen %91.', 'Tank boşaltma süresi hedefi 12 dakika, ölçülen 10 dakika.'],
    budget: ['ilaçlama pompası ve nozul seti 8.900 TL', 'tank ve gövde 13.400 TL', 'debi sensörü 2.600 TL'],
    goals: 'Hedeflerin üçü de karşılanmıştır.',
  },
  R9: {
    domain: 'Hibrit kalkışlı yük taşıma', user: 'bölgesel kargo dağıtım merkezleridir',
    metric: 'kalkış için gereken hazırlık alanı', before: '120', after: '15', unit: 'metrekare',
    lit: ['Almeida', 'geçiş uçuşunda kararlılık kaybını inceledi', 'hibrit itki mimarileri'],
    novelty: 'dikey ve yatay itki gruplarını tek kontrol döngüsünde birleştirmesi',
    arch: 'Araç dikey kalkış için dört rotor, seyir için tek itici pervane kullanır. Geçiş uçuşu kontrol ' +
      'yazılımı tarafından otomatik yönetilir. Kanat açıklığı 2,4 m, kalkış ağırlığı 9,1 kg.',
    tests: ['Geçiş uçuşu başarı hedefi %95, ölçülen %98.', 'Seyir hızı hedefi 90 km/s, ölçülen 104 km/s.', 'Dikey kalkış yüksekliği hedefi 30 m, ölçülen 34 m.'],
    // R9'un bütçe bölümü aşağıda ELLE yazılıyor (kalem ayrımı yok — kasıtlı kusur)
    budget: ['itki grubu 14.900 TL', 'batarya seti 9.700 TL', 'gövde 11.200 TL'],
    goals: 'Üç hedefin tamamı karşılanmıştır.',
  },
} satisfies Record<string, Params | Omit<Params, 'goals'> & { goals: string }>;

/** R5 ve R6'nın BİREBİR paylaştığı paragraf — benzerlik kontrolünün hedefi. */
const ORTAK_MIMARI =
  'Görev yönetim katmanı, uçuş kontrol kartından gelen telemetriyi 50 ms periyotla toplayarak karar ' +
  'motoruna iletir; karar motoru hedef önceliklendirmesini bu veriye göre günceller. Sürü içi ' +
  'haberleşme 900 MHz bandında mesh topolojisiyle sağlanır. Her ajan, komşularından gelen konum ' +
  'bilgisini 200 ms periyotla yayınlar ve çakışma önleme katmanı bu bilgiyi kullanarak minimum ' +
  '4 metre ayrım mesafesini korur.';

function arch(p: Params): [string, string] {
  if (p.arch === 'ORTAK_MIMARI') return ['3. Yöntem ve Sistem Mimarisi', ORTAK_MIMARI];
  if (p.arch === 'ZAYIF_MIMARI')
    return ['3. Yöntem ve Sistem Mimarisi',
      'Sistem bir sabit kanatlı platform ve yer kontrol istasyonundan oluşur. Bileşenler uygun şekilde seçilmiştir.'];
  if (p.arch === 'ZAYIF_YAZIM')
    return ['3. Yöntem ve Sistem Mimarisi',
      'Aracımız dört rotorlu olarak tasarlanmıstır ve ilaclama işlemini otonom şekilde yapabilinecektir. ' +
      'Sistemin çalısması için gerekli olan bileşenler seçilmiş olup montaj işlemi tamamlanmıstır. ' +
      'Debi sensörü sayesinde ilac miktarı ayarlanabilinmektedir ve bu sayede daha az ilac kullanılarak ' +
      'maliyet düsürülmektedir.'];
  return architecture(p);
}

export const DEMO_REPORTS: DemoReport[] = [
  { key: 'R1', team: 'ATMACA', title: 'Otonom Kargo Multikopteri — Ön Tasarım Raporu', category: 'Döner Kanat',
    triggers: 'Referans rapor — tüm kontroller olumlu olmalı',
    sections: [problem(P.R1), literature(P.R1), arch(P.R1), tests(P.R1), budget(P.R1), sonuc(P.R1), kaynakca(P.R1)] },

  { key: 'R2', team: 'RÜZGÂR', title: 'Dikey İnişli Kargo Aracı — Ön Tasarım Raporu', category: 'Döner Kanat',
    triggers: 'language_template: "Sonuç" ve "Kaynakça" bölümleri EKSİK',
    sections: [problem(P.R2 as Params), literature(P.R2 as Params), arch(P.R2 as Params), tests(P.R2 as Params), budget(P.R2 as Params)] },

  { key: 'R3', team: 'GARO', title: 'Otonom Su Altı Aracı — Ön Tasarım Raporu', category: 'Serbest Görev',
    triggers: 'title_content: başlık sualtı aracı, içerik tamamen hava aracı',
    sections: [problem(P.R3), literature(P.R3), arch(P.R3), tests(P.R3), budget(P.R3), sonuc(P.R3), kaynakca(P.R3)] },

  { key: 'R4', team: 'PUSAT', title: 'Taşınabilir Kan Tahlili Cihazı — Ön Tasarım Raporu', category: 'Sabit Kanat',
    triggers: 'category_fit: Sabit Kanat beyan edilmiş, içerik tıbbi tanı cihazı',
    sections: [problem(P.R4), literature(P.R4), arch(P.R4), tests(P.R4), budget(P.R4), sonuc(P.R4), kaynakca(P.R4)] },

  { key: 'R5', team: 'SİMURG', title: 'Sürü Halinde Arama Kurtarma İHA Sistemi — Ön Tasarım Raporu', category: 'Serbest Görev',
    triggers: 'similarity: R6 ile BİREBİR aynı mimari paragrafı',
    sections: [problem(P.R5), literature(P.R5), arch(P.R5), tests(P.R5), budget(P.R5), sonuc(P.R5), kaynakca(P.R5)] },

  { key: 'R6', team: 'KIVILCIM', title: 'Çoklu Araç Koordinasyon Platformu — Ön Tasarım Raporu', category: 'Serbest Görev',
    triggers: 'similarity: R5 ile BİREBİR aynı mimari paragrafı',
    sections: [problem(P.R6), literature(P.R6), arch(P.R6), tests(P.R6), budget(P.R6), sonuc(P.R6), kaynakca(P.R6)] },

  { key: 'R7', team: 'BOZKURT', title: 'Uzun Menzilli Gözetleme Uçağı — Ön Tasarım Raporu', category: 'Sabit Kanat',
    triggers: 'criteria_scoring: yöntem bölümü çok zayıf, sonuç bölümü güçlü',
    sections: [problem(P.R7), literature(P.R7), arch(P.R7), tests(P.R7), budget(P.R7), sonuc(P.R7), kaynakca(P.R7)] },

  { key: 'R8', team: 'ŞAHİN', title: 'Tarımsal İlaçlama İnsansız Hava Aracı — Ön Tasarım Raporu', category: 'Döner Kanat',
    triggers: 'language_template dil kısmı: ağır imla ve anlatım bozuklukları',
    sections: [
      ['1.2 Problem Tanımı',
        'Tarımsal ilaclama işlemi günümüzde çok fazla zaman almaktadır ve bu durum çiftcilerin ' +
        'maliyetini arttırmaktadir. Yapılan araştırmalar sonucunda bir dekar alanın ilaclanması ' +
        'ortalama 40 dakka sürdüğü görülmüştür. Bizim projemiz sayesinde bu süre azalacaktır ve ' +
        'daha verimli bir tarım yapılabilinecektir.'],
      ['2.1 Literatür ve Özgünlük',
        'Literatür taramasi yapılmıştır. Bir çok çalışma incelenmiş olup bizim projemizin daha iyi ' +
        'olduğu görülmüştür. Kaynaklar kaynakça kısmında verilmiştir.'],
      arch(P.R8), tests(P.R8), budget(P.R8), sonuc(P.R8), kaynakca(P.R8)] },

  { key: 'R9', team: 'ALTAY', title: 'Hibrit Kalkışlı Kargo Platformu — Ön Tasarım Raporu', category: 'Sabit Kanat',
    triggers: 'criteria_scoring: literatür zayıf ve bütçe kalem ayrımı yok, test güçlü',
    sections: [
      problem(P.R9),
      ['2.1 Literatür ve Özgünlük',
        'Konuyla ilgili çalışmalar incelenmiştir. Sistemimiz özgündür. Taramada 2014, 2016 ve 2018 ' +
        'yıllarına ait üç çalışma değerlendirilmiştir.'],
      arch(P.R9), tests(P.R9),
      ['5. Zaman Planı ve Bütçe',
        'Fazlar sırasıyla planlanmıştır. İtki grubu ve batarya kalemleri toplam 24.600 TL olarak tek ' +
        'satırda bütçelenmiştir. Gövde 11.200 TL tutmaktadır.'],
      sonuc(P.R9), kaynakca(P.R9)] },
];
