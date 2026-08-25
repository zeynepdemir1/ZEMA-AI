'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setCompetitionPublished } from './actions';

const SECTION = 'font-mono text-[11px] tracking-[.1em] text-ink/75';
const BODY = 'text-[14px] leading-[1.7] text-ink/85';

/**
 * Yarışma onayı (0011_competition_published.sql).
 *
 * Yönetici bu butona basana kadar yarışma TASLAK'tır — RLS yarışmacı
 * ekranından (yükleme formunun yarışma seçicisi dahil) tamamen gizler.
 * Şablon henüz hazır değilken yarışmacının yarışmayı görüp kafasının
 * karışmaması için: sayfanın EN ALTINDA, bilinçli olarak son adım.
 */
export function PublishCard({
  competitionId,
  isPublished,
}: {
  competitionId: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    if (next === false && !confirm('Yarışma yayından kaldırılsın mı? Yarışmacılar onu artık göremeyecek.')) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await setCompetitionPublished(competitionId, next);
      if (r.ok) router.refresh();
      else setError(r.error ?? 'İşlem başarısız.');
    });
  }

  return (
    <div className="border-ink/10 mt-5 border bg-white px-[26px] py-5">
      <div className={`${SECTION} mb-2.5`}>YARIŞMA ONAYI</div>
      {isPublished ? (
        <>
          <div className="text-success mb-3 font-mono text-[11px] tracking-[.1em]">
            ✓ YAYINDA — yarışmacılar bu yarışmayı görüp rapor yükleyebilir
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(false)}
            className="border-ink/[.22] text-ink/85 cursor-pointer border px-4 py-2.5 font-mono text-[11px] tracking-[.1em] disabled:opacity-50"
          >
            {pending ? 'İŞLENİYOR…' : 'YAYINDAN KALDIR'}
          </button>
        </>
      ) : (
        <>
          <p className={`${BODY} mb-4`}>
            Bu yarışma henüz <strong>taslak</strong> — yarışmacılar onu hiçbir yerde göremiyor
            (yükleme formunun yarışma seçicisinde de listelenmiyor). Şablon, şartname ve
            kriterleri tanımladıktan sonra yayımlayın.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(true)}
            className="bg-t3-blue cursor-pointer border-none px-4 py-2.5 font-mono text-[11px] tracking-[.1em] text-white disabled:opacity-50"
          >
            {pending ? 'İŞLENİYOR…' : 'YARIŞMAYI YAYIMLA'}
          </button>
        </>
      )}
      {error && (
        <div className="border-danger text-danger mt-3 border bg-[rgba(203,36,26,.06)] px-4 py-3 text-[13.5px] leading-[1.6]">
          {error}
        </div>
      )}
    </div>
  );
}
