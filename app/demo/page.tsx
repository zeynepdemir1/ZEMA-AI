import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { reportCode } from '@/lib/reports/queries';

// Bu zeminlerin üstünde BEYAZ baş harfler var: ham teal (4.26) ve gold
// (2.92) AA'yı geçmiyor, -ink varyantları geçiyor (5.81 / 5.01).
const TONE = { teal: 'bg-teal-ink', ink: 'bg-ink', gold: 'bg-gold-ink', success: 'bg-success' } as const;

/**
 * PLAN.md §6 — Demo Modu. Ana navigasyonda LİNKLENMEZ.
 * Auth bağlanmadığı için "giriş" yapılmıyor; bu ekran yalnızca rol
 * ekranlarına hızlı geçiş sağlıyor. Hedefler DB'den geliyor ki
 * rapor kimlikleri (UUID) her zaman güncel olsun.
 */
export const dynamic = 'force-dynamic';

export default async function DemoPage() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') notFound();

  const { data: reports } = await supabaseAdmin()
    .from('reports')
    .select('id, title')
    .order('created_at', { ascending: false })
    .limit(1);
  const rid = reports?.[0]?.id ?? null;

  const accounts = [
    { initials: 'ZD', label: 'Hakem ekranı', sub: rid ? `Rapor ${reportCode(rid)}` : 'Rapor yok — önce yükle', href: rid ? `/review/${rid}` : null, tone: 'teal' as const },
    { initials: 'MŞ', label: 'Yarışmacı ekranı', sub: rid ? 'Yayımlanmış geri bildirim' : 'Rapor yok', href: rid ? `/submissions/${rid}` : null, tone: 'ink' as const },
    { initials: 'YY', label: 'Yarışma Yöneticisi', sub: 'Yarışma kurulumu', href: '/admin/competitions', tone: 'gold' as const },
    { initials: 'DY', label: 'Değerlendirme Yöneticisi', sub: 'Genel pano', href: '/evaluation', tone: 'success' as const },
  ];

  return (
    <div className="relative flex flex-1 items-center justify-center px-6 py-12 lg:px-10">
      <div className="text-ink/75 border-ink/[.18] absolute top-5 right-[26px] border px-[9px] py-1 font-mono text-[10px] tracking-[.18em]">
        DEMO
      </div>

      <div className="w-full max-w-[560px]">
        <div className="text-ink/75 mb-2.5 font-mono text-[10.5px] tracking-[.14em]">
          HIZLI ROL GEÇİŞİ
        </div>
        <h2 className="font-heading m-0 mb-1.5 text-[25px] font-semibold">Ekran seç</h2>
        <p className="text-ink/75 m-0 mb-6 text-[13.5px]">
          Kimlik doğrulama henüz bağlı değil — giriş yapılmıyor, ekranlar sabit test hesabının
          verisiyle açılıyor. Bu ekran ürün navigasyonunda yer almaz.
        </p>

        <div className="flex flex-col gap-2">
          {accounts.map((d) =>
            d.href ? (
              <Link
                key={d.label}
                href={d.href}
                className="border-ink/[.12] flex w-full cursor-pointer items-center gap-[14px] border bg-white px-4 py-[14px] text-left font-sans no-underline"
              >
                <span className={`flex h-[34px] w-[34px] items-center justify-center font-mono text-[11.5px] text-white ${TONE[d.tone]}`}>
                  {d.initials}
                </span>
                <span className="flex-1">
                  <span className="text-ink block text-[14px] font-semibold">{d.label}</span>
                  <span className="text-ink/75 mt-[3px] block font-mono text-[10.5px]">{d.sub}</span>
                </span>
                <span className="text-ink/75 text-[13px]">→</span>
              </Link>
            ) : (
              <div
                key={d.label}
                className="border-ink/[.12] flex w-full items-center gap-[14px] border bg-white px-4 py-[14px] opacity-50"
              >
                <span className={`flex h-[34px] w-[34px] items-center justify-center font-mono text-[11.5px] text-white ${TONE[d.tone]}`}>
                  {d.initials}
                </span>
                <span className="flex-1">
                  <span className="text-ink block text-[14px] font-semibold">{d.label}</span>
                  <span className="text-ink/75 mt-[3px] block font-mono text-[10.5px]">{d.sub}</span>
                </span>
              </div>
            ),
          )}
        </div>

        <div className="text-ink/75 mt-5 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
          <span>Tüm ekranlar aynı seed verisini kullanır.</span>
          <Link href="/" className="text-t3-blue-ink no-underline">
            Ana sayfaya dön
          </Link>
        </div>
      </div>
    </div>
  );
}
