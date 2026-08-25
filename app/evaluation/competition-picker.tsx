'use client';

import { usePathname, useRouter } from 'next/navigation';

/**
 * Yarışma seçici — Değerlendirme Yöneticisi panosu + hakem ataması.
 *
 * Önceden bu ekranlar SABİT olarak İLK oluşturulan yarışmayı gösteriyordu
 * (bkz. lib/reports/queries.ts eski loadDashboard/loadAssignments) —
 * yeni bir yarışmaya yüklenen rapor bu yüzden panoda ve atama ekranında
 * HİÇ görünmüyordu. Seçim `?comp=` query param'ıyla korunuyor —
 * app/admin/competitions/switcher.tsx'teki desenin aynısı, ama salt
 * okunur: yarışma OLUŞTURMA burada yok, o competition_admin'in işi.
 */
export function CompetitionPicker({
  competitions,
  activeId,
}: {
  competitions: Array<{ id: string; name: string; year: number }>;
  activeId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-2.5">
      <label className="text-ink/75 font-mono text-[10.5px] tracking-[.1em]" htmlFor="eval-comp-switch">
        YARIŞMA
      </label>
      <select
        id="eval-comp-switch"
        value={activeId}
        onChange={(e) => router.push(`${pathname}?comp=${e.target.value}`)}
        className="border-ink/[.18] text-ink border bg-white px-3 py-1.5 font-sans text-[13.5px]"
      >
        {competitions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.year})
          </option>
        ))}
      </select>
    </div>
  );
}
