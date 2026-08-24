import Link from 'next/link';

/**
 * KVKK aydınlatma metni — PLAN.md §3.2 ve §8 ("asla kesme").
 *
 * ⚠️ HUKUKİ GÖZDEN GEÇİRME GEREKLİ. Bu metin KVKK m.10'un saydığı zorunlu
 * unsurları kapsayacak şekilde yapılandırıldı, ama hukukçu onayından
 * geçmedi. Aşağıda [KÖŞELİ PARANTEZ] içindeki alanlar doldurulmalı.
 *
 * m.10 kontrol listesi ve karşılıkları:
 *   veri sorumlusunun kimliği        → "Veri sorumlusu"
 *   işlenen veri kategorileri        → "İşlenen kişisel veriler"
 *   işleme amacı                     → "İşleme amaçları"
 *   toplama yöntemi ve hukuki sebep  → "Toplama yöntemi ve hukuki sebep"
 *   kimlere/hangi amaçla aktarılacağı→ "Aktarım" + "Yurt dışına aktarım"
 *   m.11'deki haklar                 → "Haklarınız" + "Başvuru"
 */
const SECTIONS = [
  {
    title: 'Veri sorumlusu',
    body:
      'ZEMA, T3 Vakfı Bursiyer Yapay Zeka Creathonu kapsamında geliştirilen bir rapor ' +
      'değerlendirme uygulamasıdır. Bu metin kapsamında veri sorumlusu ' +
      '[Hatice Zeynep Demir], adres [İzmit,Kocaeli/Türkiye], e-posta [hzeynepdemirr@gmail.com].',
  },
  {
    title: 'İşlenen kişisel veriler',
    body:
      'Kimlik ve iletişim verisi: ad-soyad, e-posta adresi. Hesap verisi: kullanıcı rolü, ' +
      'KVKK onay tarihi. İşlem güvenliği verisi: giriş kayıtları ve uygulama içi işlem ' +
      'kayıtları (audit log). Ayrıca yüklediğiniz rapor dosyaları ile bu dosyalardan ' +
      'çıkarılan metin içeriği ve bu içerik üzerinden üretilen değerlendirme kayıtları.',
  },
  {
    title: 'İşleme amaçları',
    body:
      'Yarışma başvurularının alınması ve yönetilmesi; raporların şablon uyumu, içerik ' +
      'tutarlılığı, kategori uygunluğu ve benzerlik açısından incelenmesi; hakem ' +
      'değerlendirmesinin yürütülmesi; değerlendirme sonucunun tarafınıza iletilmesi; ' +
      'itiraz süreçlerinin yürütülmesi ve işlem güvenliğinin sağlanması.',
  },
  {
    title: 'Toplama yöntemi ve hukuki sebep',
    body:
      'Veriler tamamen otomatik yollarla, uygulamadaki kayıt formu ve dosya yükleme ' +
      'arayüzü üzerinden elektronik ortamda toplanır. Hukuki sebep, yarışma katılım ' +
      'ilişkisinin kurulması ve yürütülmesi bakımından KVKK m.5/2-c (sözleşmenin ' +
      'ifası) ve m.5/2-f (veri sorumlusunun meşru menfaati); yurt dışına aktarım ' +
      'bakımından ise m.9 uyarınca AÇIK RIZANIZDIR. Kayıt formundaki onay kutusu bu ' +
      'açık rızayı verir; onay verilmeden hesap oluşturulamaz.',
  },
  {
    title: 'Aktarım',
    body:
      'Verileriniz yarışma organizasyonu içinde yalnızca yetkili rollere açılır: hakem ' +
      'kendisine atanan raporu görür, yarışma yönetimi süreci izler. Rapor ' +
      'değerlendirmesinin ham çıktısı diğer yarışmacılara hiçbir koşulda açılmaz.',
  },
  {
    title: 'Yurt dışına aktarım',
    body:
      'Rapor metinleri, analiz üretmek amacıyla Google LLC tarafından işletilen Gemini ' +
      'API hizmetine aktarılır; bu hizmetin sunucuları Türkiye dışında bulunur. Aktarım ' +
      'yalnızca analiz amacıyla ve açık rızanıza dayanarak yapılır. Hizmetin ücretsiz ' +
      'katmanında gönderilen içeriğin hizmet iyileştirme amacıyla kullanılabildiğini ' +
      'ayrıca bildiririz. Açık rıza vermek istemiyorsanız uygulamaya rapor yüklemeyiniz.',
  },
  {
    title: 'Otomatik analiz ve insan denetimi',
    body:
      'Raporunuz otomatik bir sistem tarafından analiz edilir. Bu analiz TEK BAŞINA ' +
      'sonuç doğurmaz: üretilen her değerlendirme hakeme öneri olarak sunulur, hakem ' +
      'onaylamadıkça size iletilmez ve hakem öneriyi değiştirebilir veya reddedebilir. ' +
      'KVKK m.11/1-g uyarınca, münhasıran otomatik sistemler vasıtasıyla yapılan ' +
      'analiz sonucu aleyhinize bir sonuç doğduğunu düşünüyorsanız buna itiraz etme ' +
      'hakkınız vardır.',
  },
  {
    title: 'Saklama süresi',
    body:
      'Veriler yarışma sürecinin tamamlanmasını takip eden itiraz süresi boyunca ' +
      'saklanır, bu sürenin sonunda silinir veya anonim hale getirilir. Mevzuatın daha ' +
      'uzun saklama öngördüğü hâllerde ilgili süre uygulanır.',
  },
  {
    title: 'Haklarınız',
    body:
      'KVKK m.11 uyarınca; kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse ' +
      'bilgi talep etme, işleme amacını ve amaca uygun kullanılıp kullanılmadığını ' +
      'öğrenme, yurt içinde/yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya ' +
      'yanlış işlenmişse düzeltilmesini isteme, silinmesini veya yok edilmesini isteme, ' +
      'düzeltme/silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme, ' +
      'münhasıran otomatik analiz sonucu aleyhinize çıkan sonuca itiraz etme ve zarara ' +
      'uğramanız hâlinde giderilmesini talep etme haklarına sahipsiniz.',
  },
  {
    title: 'Başvuru',
    body:
      'Haklarınızı kullanmak için — silme talebi dahil — [hzeynepdemirr@gmail.com] ' +
      'adresine yazılı olarak başvurabilirsiniz. Başvurunuz en geç otuz gün içinde ' +
      'yanıtlanır. Uygulama içinden tek tıkla hesap silme özelliği henüz sunulmuyor; ' +
      'talebiniz bu adres üzerinden işlenir.',
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex-1 px-6 pt-11 pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[760px]">
        <Link href="/auth" className="text-teal mb-[18px] inline-block text-[13px] no-underline">
          ← Kayıt ekranına dön
        </Link>

        <div className="text-ink/50 mb-2.5 font-mono text-[10.5px] tracking-[.14em]">
          KVKK · AYDINLATMA METNİ
        </div>
        <h1 className="font-heading m-0 mb-7 text-[32px] font-semibold tracking-[-.01em]">
          Kişisel verilerinizin işlenmesi
        </h1>

        <div className="border-ink/10 flex flex-col gap-6 border bg-white px-8 py-8">
          {SECTIONS.map((s) => (
            <div key={s.title} className="border-ink/[.15] border-l-2 pl-4">
              <h2 className="font-heading m-0 mb-2 text-[17px] font-semibold">{s.title}</h2>
              <p className="text-ink/[.72] m-0 text-[14px] leading-[1.7]">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="border-ink/[.12] bg-ink/[.03] mt-5 flex items-center gap-[14px] border px-[22px] py-[18px]">
          <span className="text-gold font-mono text-[13px]">◆</span>
          <span className="text-ink/[.72] text-[13.5px] leading-[1.6]">
            Kayıt formundaki onay kutusu işaretlenmeden hesap oluşturulamaz; bu onay
            aynı zamanda rapor içeriğinizin analiz amacıyla yurt dışına aktarılmasına
            verdiğiniz açık rızayı kapsar.
          </span>
        </div>
      </div>
    </div>
  );
}
