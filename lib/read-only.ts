import { NextResponse } from 'next/server';

/**
 * Salt okunur vitrin modu.
 *
 * Proje artık kullanılmıyor, yalnızca portfolyo vitrini. `READ_ONLY=true`
 * iken veri değiştiren her server action ve route handler en başta
 * `assertWritable()` / `readOnlyResponse()` ile durur — hangi kullanıcı
 * olursa olsun, yönetici dahil.
 *
 * Değişken bilerek NEXT_PUBLIC_ DEĞİL: istemci bundle'ına gömülmüyor,
 * sunucu her istekte okuyor. Arayüz bayrağı kök layout'tan prop olarak
 * alıyor (components/zema/read-only.tsx).
 *
 * Yedek kilit: supabase/migrations/0018_read_only.sql (RESTRICTIVE RLS).
 * Geri almak: READ_ONLY'yi kaldır + supabase/rollback/0018_read_only_down.sql.
 */

export const READ_ONLY_MESSAGE = 'Bu site salt okunur, işlem yapılamaz.';

export function isReadOnly(): boolean {
  return process.env.READ_ONLY === 'true';
}

export class ReadOnlyError extends Error {
  constructor() {
    super(READ_ONLY_MESSAGE);
    this.name = 'ReadOnlyError';
  }
}

/** Server action'ların ilk satırı. READ_ONLY=true ise fırlatır. */
export function assertWritable(): void {
  if (isReadOnly()) throw new ReadOnlyError();
}

/**
 * Route handler karşılığı: fırlatmak 500 döndürürdü, bunun yerine 403 +
 * aynı mesaj. Yazılabilirse null.
 */
export function readOnlyResponse(): NextResponse | null {
  return isReadOnly() ? NextResponse.json({ error: READ_ONLY_MESSAGE }, { status: 403 }) : null;
}
