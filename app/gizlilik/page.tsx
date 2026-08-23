import Link from 'next/link';

/**
 * KVKK aydınlatma metni — PLAN.md §3.2 ve §8 ("asla kesme").
 * Tasarım dosyasında bu ekran yoktu; kayıt formundaki zorunlu onay bu sayfaya
 * link verdiği için iskeleti burada kuruldu. Metnin hukuki son hali gözden
 * geçirilmeli — aşağıdaki içerik plandaki kapsam maddelerini karşılıyor.
 */
const SECTIONS = [
  {
    title: 'Veri sorumlusu',
    body: 'ZEMA, T3 Vakfı Bursiyer Yapay Zeka Creathonu kapsamında geliştirilen bir rapor değerlendirme uygulamasıdır. Kişisel verileriniz bu kapsamda işlenir.',
  },
  {
    title: 'İşlenen veriler',
    body: 'Ad-soyad, e-posta adresi ve hesap rolü; yüklediğiniz rapor dosyaları ile bu dosyalardan çıkarılan metin içeriği; değerlendirme sürecinde oluşan puan, geri bildirim ve işlem kayıtları.',
  },
  {
    title: 'İşleme amacı',
    body: 'Yarışma başvurularının alınması, raporların şablon uyumu, içerik tutarlılığı, kategori uygunluğu ve benzerlik açısından incelenmesi, hakem değerlendirmesinin yürütülmesi ve sonucun tarafınıza iletilmesi.',
  },
  {
    title: 'Yurt dışına aktarım',
    body: 'Rapor metinleri, analiz üretmek amacıyla Anthropic tarafından işletilen Claude API hizmetine aktarılır. Aktarım yalnızca analiz amacıyla yapılır; bu veriler model eğitimi için kullanılmaz.',
  },
  {
    title: 'Saklama süresi',
    body: 'Veriler yarışma sürecinin tamamlanmasını takip eden itiraz süresi boyunca saklanır, sonrasında silinir veya anonim hale getirilir.',
  },
  {
    title: 'Haklarınız',
    body: 'KVKK m.11 uyarınca verilerinize erişme, düzeltilmesini veya silinmesini isteme hakkına sahipsiniz. Hesap ayarlarınızdaki "Hesabımı ve Verilerimi Sil" işlemiyle bu talebi doğrudan iletebilirsiniz.',
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
            Kayıt formundaki onay kutusu işaretlenmeden hesap oluşturulamaz.
          </span>
        </div>
      </div>
    </div>
  );
}
