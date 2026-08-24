import Link from 'next/link';

/**
 * Yarışma kurulumu — gerçek, tıklanabilir sekmeler.
 *
 * Öncesinde bu üç adım (Yarışma bilgileri / Şablon ve kriterler / Hakem
 * ataması) düz <div>'di — tasarımın "ilerleme göstergesi" niyetiyle
 * bırakılmıştı ama içerikleri yoktu, yönetici hiçbirine giremiyordu.
 *
 * "Hakem ataması" burada YOK: o §3.1'de Değerlendirme Yöneticisi'nin işi
 * (/evaluation/assignments), Yarışma Yöneticisi'nin erişimi yok — bu
 * sekmeye eklemek tıklanınca 403 veren ölü bir link olurdu.
 */
const TABS = [
  { num: '1', label: 'Yarışma bilgileri', href: '/admin/competitions' },
  { num: '2', label: 'Şablon ve kriterler', href: '/admin/competitions/template' },
] as const;

export function AdminTabs({ active, comp }: { active: 1 | 2; comp: string }) {
  return (
    <div className="mb-[30px] flex flex-wrap items-center">
      {TABS.map((t, i) => {
        const isActive = Number(t.num) === active;
        return (
          <Link
            key={t.num}
            href={`${t.href}?comp=${comp}`}
            className={`border-ink/[.12] flex flex-1 cursor-pointer items-center gap-2.5 border px-5 py-3 no-underline ${
              i > 0 ? 'border-l-0' : ''
            } ${isActive ? 'text-ink bg-white' : 'text-ink/[.55] bg-transparent hover:bg-white'}`}
          >
            <span
              className={`flex h-[22px] w-[22px] items-center justify-center border font-mono text-[11px] ${
                isActive ? 'border-ink bg-ink text-white' : 'border-ink/[.25] text-ink/75 bg-transparent'
              }`}
            >
              {t.num}
            </span>
            <span className="text-[13.5px] font-medium">{t.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
