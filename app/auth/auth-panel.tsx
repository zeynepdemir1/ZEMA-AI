'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { checkRegistrationCode, signIn, signUp, type CodeCheck } from './actions';

const LABEL = 'text-ink/60 mb-[7px] block font-mono text-[10.5px] tracking-[.12em]';
/**
 * placeholder:text-ink/40 — Tailwind v4 preflight placeholder'ı currentColor'ın
 * %50'si yapıyor; Ink Navy üzerinde bu fazla koyu kalıyor ve ipucu metni dolu
 * bir DEĞER gibi okunuyordu ("Zeynep Demir" örneği). Açıkça soluklaştırıldı.
 */
const INPUT =
  'border-ink/[.18] text-ink placeholder:text-ink/40 mb-[18px] w-full border bg-white px-[14px] py-3 font-sans text-[14.5px]';

export function AuthPanel() {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const tabClass = (on: boolean) =>
    `cursor-pointer border-none p-[13px] font-sans text-[14px] font-semibold ${
      on ? 'bg-ink text-white' : 'text-ink/60 bg-transparent'
    }`;

  return (
    <div className="w-full max-w-[430px]">
      <div className="border-ink/[.14] mb-[26px] grid grid-cols-2 border">
        <button onClick={() => setTab('login')} className={tabClass(tab === 'login')}>
          Giriş
        </button>
        <button onClick={() => setTab('register')} className={tabClass(tab === 'register')}>
          Kayıt Ol
        </button>
      </div>

      {tab === 'login' ? <LoginForm /> : <RegisterForm />}
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('next', params.get('next') ?? '');
    setError(null);
    startTransition(async () => {
      const r = await signIn(fd);
      if (!r.ok) setError(r.error);
      else router.push(r.redirectTo);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <h3 className="font-heading m-0 mb-1.5 text-[23px] font-semibold">Tekrar hoş geldiniz</h3>
      <p className="text-ink/60 m-0 mb-[26px] text-[13.5px]">
        Giriş yaptığınızda hesabınızın rolüne göre yönlendirilirsiniz.
      </p>

      <label className={LABEL} htmlFor="login-email">E-POSTA</label>
      <input id="login-email" name="email" type="email" autoComplete="email" placeholder="ad.soyad@ornek.com" className={INPUT} />

      <label className={LABEL} htmlFor="login-password">ŞİFRE</label>
      <input id="login-password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" className={`${INPUT} mb-2.5`} />

      {error && (
        <div className="border-danger text-danger mb-4 border bg-[rgba(180,72,63,.06)] px-3 py-2 text-[12.5px]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-ink w-full cursor-pointer border-none p-[14px] font-sans text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Giriş yapılıyor…' : 'Giriş Yap'}
      </button>
    </form>
  );
}

function RegisterForm() {
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeVal, setCodeVal] = useState('');
  // Sonucu, hangi koda ait olduğuyla birlikte tut — böylece kullanıcı yazmaya
  // devam ederken eski bir yanıt gösterilmez ve effect içinde senkron
  // setState'e gerek kalmaz.
  const [checked, setChecked] = useState<{ code: string; result: CodeCheck } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Kod doğrulaması sunucuda yapılır (bkz. actions.ts). Yazarken debounce'la.
  useEffect(() => {
    const code = codeVal.trim();
    if (!code) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        const result = await checkRegistrationCode(code);
        setChecked({ code, result });
      });
    }, 350);
    return () => clearTimeout(t);
  }, [codeVal]);

  const trimmed = codeVal.trim();
  const check: CodeCheck =
    trimmed && checked?.code === trimmed ? checked.result : { state: 'empty' };

  const borderColor =
    check.state === 'invalid'
      ? 'border-danger'
      : check.state === 'valid'
        ? 'border-success'
        : 'border-ink/20';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const r = await signUp(fd);
          if (!r.ok) setError(r.error);
          else router.push(r.redirectTo);
        });
      }}
    >
      <h3 className="font-heading m-0 mb-1.5 text-[23px] font-semibold">Hesap oluşturun</h3>
      <p className="text-ink/60 m-0 mb-[26px] text-[13.5px]">
        Kod girmezseniz Yarışmacı olarak kaydolursunuz.
      </p>

      <label className={LABEL} htmlFor="reg-name">
        AD SOYAD
      </label>
      <input id="reg-name" name="full_name" autoComplete="name" placeholder="Adınız ve soyadınız" className={INPUT} />

      <label className={LABEL} htmlFor="reg-email">
        E-POSTA
      </label>
      <input id="reg-email" name="email" type="email" autoComplete="email" placeholder="ad.soyad@ornek.com" className={INPUT} />

      <label className={LABEL} htmlFor="reg-password">
        ŞİFRE
      </label>
      <input
        id="reg-password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="En az 8 karakter"
        className={`${INPUT} mb-4`}
      />

      {/* Kayıt kodu — varsayılan katlanmış (PLAN.md §3.2) */}
      {!codeOpen ? (
        <div className="border-ink/[.18] mb-[18px] border-t border-dashed pt-[14px]">
          <button
            type="button"
            onClick={() => setCodeOpen(true)}
            className="text-teal inline-flex cursor-pointer items-center gap-[7px] border-none bg-transparent p-0 text-[13px]"
          >
            <span className="font-mono text-[13px]">＋</span>
            Hakem veya yöneticiyseniz kayıt kodunuzu girin
          </button>
        </div>
      ) : (
        <div className="border-teal/[.35] mb-[18px] border bg-[rgba(76,133,119,.06)] p-4">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-teal-ink font-mono text-[10.5px] tracking-[.12em]">
              KAYIT KODU · OPSİYONEL
            </span>
            <button
              type="button"
              onClick={() => {
                setCodeOpen(false);
                setCodeVal('');
                setChecked(null);
              }}
              className="text-ink/50 cursor-pointer border-none bg-transparent p-0 text-[12px]"
            >
              Gizle
            </button>
          </div>

          <input
            value={codeVal}
            onChange={(e) => setCodeVal(e.target.value)}
            name="code"
            placeholder="ZEMA-XXXX-0000"
            aria-label="Kayıt kodu"
            className={`text-ink placeholder:text-ink/40 w-full border ${borderColor} bg-white px-[13px] py-[11px] font-mono text-[13.5px] tracking-[.06em]`}
          />

          {check.state === 'invalid' && (
            <div className="text-danger mt-[9px] font-mono text-[11.5px]">
              ✕ Geçersiz kayıt kodu
            </div>
          )}
          {check.state === 'valid' && (
            <div className="text-success mt-[9px] font-mono text-[11.5px]">
              ✓ {check.roleLabel} rolü atanacak
            </div>
          )}

          <div className="text-ink/[.55] mt-2.5 text-[12px] leading-[1.55]">
            Kod, yarışma yönetimi tarafından e-posta ile iletilir. Boş bırakırsanız Yarışmacı olarak
            kaydolursunuz.
          </div>
        </div>
      )}

      <label className="mb-5 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name="kvkk"
          required
          className="accent-ink mt-0.5 h-[15px] w-[15px]"
        />
        <span className="text-ink/70 text-[12.5px] leading-[1.55]">
          Kişisel verilerimin işlenmesine izin veriyorum.{' '}
          <Link href="/gizlilik" className="text-teal">
            KVKK Aydınlatma Metni
          </Link>
        </span>
      </label>

      {error && (
        <div className="border-danger text-danger mb-4 border bg-[rgba(180,72,63,.06)] px-3 py-2 text-[12.5px]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-ink w-full cursor-pointer border-none p-[14px] font-sans text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {pending ? 'Hesap oluşturuluyor…' : 'Kayıt Ol'}
      </button>
    </form>
  );
}
