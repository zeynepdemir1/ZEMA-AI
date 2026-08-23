'use client';

import { useTransition } from 'react';
import { signOut } from '@/app/auth/actions';

export function SignOutButton({ label = 'Çıkış' }: { label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => void (await signOut()))}
      disabled={pending}
      title="Çıkış yap"
      className="text-ink/50 hover:text-ink cursor-pointer border-none bg-transparent p-0 font-mono text-[10px] tracking-[.1em] disabled:opacity-50"
    >
      {pending ? '…' : label}
    </button>
  );
}
