import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DEMO_ACCOUNTS } from '@/lib/design/mock-data';

const AVATAR_TONE = {
  teal: 'bg-teal',
  ink: 'bg-ink',
  gold: 'bg-gold',
  success: 'bg-success',
} as const;

/**
 * PLAN.md §6 — Demo Modu.
 * Ana navigasyonda LİNKLENMEZ. Yalnızca NEXT_PUBLIC_DEMO_MODE=true iken
 * erişilebilir; üretimde bu env kapatılır ve rota 404 döner.
 */
export default function DemoPage() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') notFound();

  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-12 lg:px-10">
      <div className="text-ink/40 border-ink/[.18] absolute top-5 right-[26px] border px-[9px] py-1 font-mono text-[10px] tracking-[.18em]">
        DEMO
      </div>

      <div className="w-full max-w-[560px]">
        <div className="text-ink/50 mb-2.5 font-mono text-[10.5px] tracking-[.14em]">
          HIZLI ROL GEÇİŞİ
        </div>
        <h2 className="font-heading m-0 mb-1.5 text-[25px] font-semibold">Demo hesabı seç</h2>
        <p className="text-ink/60 m-0 mb-6 text-[13.5px]">
          Hazır test hesaplarıyla tek tıkla giriş. Bu ekran ürün navigasyonunda yer almaz.
        </p>

        <div className="flex flex-col gap-2">
          {DEMO_ACCOUNTS.map((d) => (
            <Link
              key={d.email}
              href={d.href}
              className="border-ink/[.12] flex w-full cursor-pointer items-center gap-[14px] border bg-white px-4 py-[14px] text-left font-sans no-underline"
            >
              <span
                className={`flex h-[34px] w-[34px] items-center justify-center font-mono text-[11.5px] text-white ${AVATAR_TONE[d.tone]}`}
              >
                {d.initials}
              </span>
              <span className="flex-1">
                <span className="text-ink block text-[14px] font-semibold">{d.label}</span>
                <span className="text-ink/50 mt-[3px] block font-mono text-[10.5px]">
                  {d.email}
                </span>
              </span>
              <span className="text-ink/[.35] text-[13px]">→</span>
            </Link>
          ))}
        </div>

        <div className="text-ink/[.55] mt-5 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
          <span>Tüm hesaplar aynı örnek yarışma verisini kullanır.</span>
          <Link href="/" className="text-teal no-underline">
            Ana sayfaya dön
          </Link>
        </div>
      </div>
    </div>
  );
}
