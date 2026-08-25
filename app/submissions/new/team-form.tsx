'use client';

import { useState, useTransition } from 'react';
import { createTeam } from './actions';

const SECTION = 'font-mono text-[10.5px] tracking-[.12em] text-ink/75';
const MUTED = 'text-[13px] leading-[1.6] text-ink/75';
const INPUT =
  'border-ink/[.18] text-ink w-full border bg-white px-[14px] py-3 font-sans text-[14.5px] disabled:opacity-60';

const NAME_MIN = 3;
const NAME_MAX = 50;
const NAME_RE = /^[\p{L}\p{N}_-]+$/u;

/**
 * Takımı olmayan bir yarışma seçildiğinde gösterilen form.
 *
 * Önceki sürüm arka planda sessizce takım açıyordu. Kullanıcının adına,
 * onayı olmadan ve adını kendisi seçmeden kayıt yaratmak doğru değil —
 * artık formu doldurup onaylıyor.
 *
 * T3 KYS'nin takım formundan esinlenildi ama ülke/şehir/ilçe, tanıtım
 * dosyası ve ek onay kutuları BİLİNÇLİ OLARAK alınmadı: bu ölçekte
 * gereksiz karmaşıklık.
 */
export function TeamForm({
  competitionId,
  competitionName,
  onCreated,
}: {
  competitionId: string;
  competitionName: string;
  onCreated: (competitionId: string) => void;
}) {
  const thisYear = new Date().getFullYear();
  const [name, setName] = useState('');
  const [year, setYear] = useState<string>(String(thisYear));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // İstemci tarafı ön kontrol — sunucudaki doğrulamanın aynısı, kullanıcı
  // gönderdikten sonra değil yazarken görsün.
  const trimmed = name.trim();
  const yearNum = Number(year);
  const nameError =
    trimmed.length === 0
      ? null
      : trimmed.length < NAME_MIN || trimmed.length > NAME_MAX
        ? `Takım adı ${NAME_MIN}-${NAME_MAX} karakter olmalı.`
        : !NAME_RE.test(trimmed)
          ? 'Yalnızca harf, rakam, tire ve alt çizgi (boşluk olmaz).'
          : null;
  const yearError =
    year === ''
      ? null
      : !Number.isInteger(yearNum)
        ? 'Yıl bir tam sayı olmalı.'
        : yearNum > thisYear
          ? `Kuruluş yılı ${thisYear} yılından büyük olamaz.`
          : yearNum < 1900
            ? 'Kuruluş yılı 1900 yılından küçük olamaz.'
            : null;
  const ready = trimmed.length > 0 && year !== '' && !nameError && !yearError;

  function submit() {
    setError(null);
    start(async () => {
      const r = await createTeam({ competitionId, name: trimmed, foundedYear: yearNum });
      if (!r.ok) setError(r.error ?? 'Takım oluşturulamadı.');
      else onCreated(competitionId);
    });
  }

  return (
    <div className="border-ink/10 border bg-white p-7">
      <div className={`${SECTION} mb-2`}>TAKIM OLUŞTUR</div>
      <p className="text-ink/85 m-0 mb-5 text-[14px] leading-[1.7]">
        <span className="font-medium">{competitionName}</span> yarışmasında henüz takımınız
        yok. Rapor yükleyebilmek için önce takımınızı oluşturun.
      </p>

      <label className={`${SECTION} mb-2 block`} htmlFor="team-name">
        TAKIM ADI
      </label>
      <input
        id="team-name"
        value={name}
        disabled={pending}
        maxLength={NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        placeholder="GARO_2026"
        className={INPUT}
      />
      <div className={`${MUTED} mt-1 mb-5`}>
        {nameError ? (
          <span className="text-danger">{nameError}</span>
        ) : (
          `${NAME_MIN}-${NAME_MAX} karakter · harf, rakam, tire, alt çizgi`
        )}
      </div>

      <label className={`${SECTION} mb-2 block`} htmlFor="team-year">
        TAKIM KURULUŞ YILI
      </label>
      <input
        id="team-year"
        type="number"
        value={year}
        disabled={pending}
        min={1900}
        max={thisYear}
        onChange={(e) => setYear(e.target.value)}
        className={`${INPUT} font-mono`}
      />
      <div className={`${MUTED} mt-1 mb-6`}>
        {yearError ? (
          <span className="text-danger">{yearError}</span>
        ) : (
          `En fazla ${thisYear} olabilir.`
        )}
      </div>

      {error && (
        <div className="border-danger text-danger mb-5 border bg-[rgba(203,36,26,.06)] px-4 py-3 text-[13.5px] leading-[1.6]">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !ready}
        className="bg-t3-blue w-full cursor-pointer border-none py-[14px] font-sans text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Oluşturuluyor…' : 'Oluştur ve Devam Et'}
      </button>
    </div>
  );
}
