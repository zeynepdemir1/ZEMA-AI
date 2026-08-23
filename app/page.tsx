import Link from 'next/link';
import { ZemaMark, ZemaWordmark, GridTexture } from '@/components/zema/brand';
import { DemoVideoDialog } from './demo-video-dialog';

const STEPS = [
  {
    n: '01',
    accent: 'border-t-teal',
    title: 'AI raporu analiz eder',
    body: 'Şablon uyumu, başlık-içerik tutarlılığı, kategori uygunluğu ve benzerlik oranı taranır; her kriter için taslak geri bildirim üretilir.',
  },
  {
    n: '02',
    accent: 'border-t-gold',
    title: 'Hakem inceler ve onaylar',
    body: "Hakem her kriteri doğrudan düzenler ya da AI'ye talimat vererek yeniden yazdırır. Onaylanmayan hiçbir metin dışarı çıkmaz.",
  },
  {
    n: '03',
    accent: 'border-t-ink',
    title: 'Yarışmacı sonucu görür',
    body: 'Takıma yalnızca hakemin mühürlediği geri bildirim ulaşır: güçlü yönler ve geliştirilecek alanlar, kriter kriter.',
  },
];

export default function LandingPage() {
  return (
    <div>
      {/* ─── Hero ─── */}
      <div className="bg-ink relative overflow-hidden text-white">
        <GridTexture />

        <div className="relative mx-auto flex max-w-[1180px] items-center justify-between border-b border-white/[.12] px-10 py-[22px]">
          <div className="flex items-center gap-3">
            <ZemaMark />
            <ZemaWordmark />
          </div>
          <div className="flex items-center gap-7 text-[13.5px]">
            <span className="opacity-[.62]">Nasıl Çalışır</span>
            <span className="opacity-[.62]">Roller</span>
            <span className="opacity-[.62]">İletişim</span>
            <Link
              href="/auth"
              className="cursor-pointer border border-white/[.35] px-4 py-2 text-[13px] font-semibold text-white no-underline"
            >
              Giriş Yap
            </Link>
          </div>
        </div>

        <div className="relative mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-16 px-10 pt-[76px] pb-[84px] lg:grid-cols-[1.15fr_.85fr]">
          <div>
            <div className="text-gold mb-[22px] font-mono text-[11.5px] tracking-[.18em]">
              T3 VAKFI · TEKNOFEST DEĞERLENDİRME ALTYAPISI
            </div>
            <h1 className="font-heading m-0 mb-[22px] text-[52px] leading-[1.08] font-bold tracking-[-.01em] text-pretty">
              Raporu AI okur,
              <br />
              kararı hakem verir.
              <br />
              <span className="text-teal-pale">Karar hâlâ hakemin.</span>
            </h1>
            <p className="m-0 mb-[34px] max-w-[520px] text-[16.5px] leading-[1.65] text-white/[.74] text-pretty">
              ZEMA; TEKNOFEST raporlarını şablon, içerik tutarlılığı, kategori uyumu ve benzerlik
              açısından analiz eder, kriter bazlı taslak geri bildirim üretir. Bu taslak yayınlanmaz
              — hakem inceler, düzenler ve mühürler.
            </p>
            <div className="flex flex-wrap items-center gap-[18px]">
              <Link
                href="/auth"
                className="text-ink cursor-pointer bg-white px-[30px] py-[15px] text-[15px] font-semibold no-underline"
              >
                Kullanmaya Başla
              </Link>
              <span className="font-mono text-[11.5px] tracking-[.06em] text-white/50">
                KAYIT KODU OLANLAR ROLÜNE OTOMATİK ATANIR
              </span>
            </div>
          </div>

          {/* AI taslağı → hakem onayı dönüşümü: ürünün tek cümlelik özeti */}
          <div className="border border-white/[.16] bg-white/[.04] p-6">
            <div className="mb-[18px] font-mono text-[10.5px] tracking-[.16em] text-white/50">
              K-04 · TEST VE DOĞRULAMA
            </div>
            <div className="border-teal mb-3 border-l-[3px] bg-[rgba(76,133,119,.10)] px-[14px] py-3">
              <div className="text-teal-pale mb-[7px] font-mono text-[10px] tracking-[.12em]">
                AI TASLAĞI · ONAY BEKLİYOR
              </div>
              <div className="text-[13.5px] leading-[1.6] text-white/[.82]">
                Bölüm 4&apos;te test senaryoları listelenmiş ancak başarı ölçütü tanımlanmamış.
              </div>
            </div>
            <div className="mx-0 mt-1 mb-2 flex justify-center text-base text-white/[.32]">↓</div>
            <div className="border-gold border-l-[3px] bg-[rgba(201,138,62,.12)] px-[14px] py-3">
              <div className="text-gold-pale mb-[7px] font-mono text-[10px] tracking-[.12em]">
                HAKEM ONAYLI · YAYINLANDI
              </div>
              <div className="text-[13.5px] leading-[1.6] text-white/90">
                Test senaryolarınız iyi kurgulanmış. Her senaryo için sayısal bir başarı ölçütü
                eklerseniz bölüm tam puana ulaşır.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Nasıl çalışır ─── */}
      <div className="mx-auto max-w-[1180px] px-10 pt-[72px] pb-5">
        <div className="text-teal mb-[10px] font-mono text-[11px] tracking-[.18em]">
          NASIL ÇALIŞIR
        </div>
        <h2 className="font-heading m-0 mb-[38px] text-[30px] font-semibold tracking-[-.01em]">
          Üç adım, tek karar mercii
        </h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className={`border-ink/10 ${s.accent} border border-t-[3px] bg-white px-6 pt-[26px] pb-7`}
            >
              <div className="text-ink/[.22] mb-[14px] font-mono text-[26px]">{s.n}</div>
              <h3 className="font-heading m-0 mb-[10px] text-[19px] font-semibold">{s.title}</h3>
              <p className="text-ink/[.68] m-0 text-[14.5px] leading-[1.62]">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Kapanış + demo videosu ─── */}
      <div className="mx-auto max-w-[1180px] px-10 pt-11 pb-20">
        <div className="border-ink/10 flex flex-wrap items-center justify-between gap-10 border bg-white px-8 py-[30px]">
          <div>
            <div className="font-heading mb-1.5 text-[20px] font-semibold">
              Değerlendirme sürecinizi ZEMA ile kurun
            </div>
            <div className="text-ink/[.62] text-[14px]">
              Yarışmacılar doğrudan kaydolur; hakem ve yöneticiler kayıt koduyla rollerine atanır.
            </div>
          </div>
          <DemoVideoDialog />
        </div>
        <div className="border-ink/10 text-ink/[.45] mt-[34px] flex flex-wrap justify-between gap-4 border-t pt-5 font-mono text-[11px] tracking-[.1em]">
          <span>ZEMA · T3 VAKFI CREATHON</span>
          <span>KVKK UYUMLU · VERİLER TÜRKİYE&apos;DE İŞLENİR</span>
        </div>
      </div>
    </div>
  );
}
