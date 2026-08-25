'use client';

import { useTransition } from 'react';
import { signOut } from '@/app/auth/actions';

export function SignOutButton({
  label = 'Çıkış',
  className = 'text-ink/75 hover:text-ink',
}: {
  label?: string;
  /** Koyu zeminli header ile açık zeminli kenar çubuğu farklı renk ister. */
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => void (await signOut()))}
      disabled={pending}
      title="Çıkış yap"
      className={`${className} cursor-pointer border-none bg-transparent p-0 font-mono text-[10.5px] tracking-[.1em] disabled:opacity-50`}
    >
      {pending ? '…' : label}
    </button>
  );
}
