import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Oturumlu Supabase istemcisi — publishable anahtar + kullanıcı cookie'si.
 *
 * ⚠️ ÖNEMLİ: Bu istemci RLS'e TABİ. supabaseAdmin() ise RLS'i baypas eder.
 * Kullanıcı verisi okuyan/yazan her yer BURAYI kullanmalı; admin istemcisi
 * yalnızca job runner, rol atama ve seed gibi sistem işleri için.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Server component'ten çağrıldığında cookie yazılamaz — normal.
            // Oturum yenilemesi middleware'de yapılıyor.
          }
        },
      },
    },
  );
}

export type UserRole = 'competition_admin' | 'evaluation_admin' | 'judge' | 'competitor';

export type SessionUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
};

/** Oturumdaki kullanıcı + profiles'taki rolü. Yoksa null. */
export async function currentUser(): Promise<SessionUser | null> {
  const db = await supabaseServer();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;

  // profiles_select_own politikası kendi satırını okumaya izin veriyor.
  const { data: profile } = await db
    .from('profiles')
    .select('role, full_name')
    .eq('id', auth.user.id)
    .maybeSingle();

  return {
    id: auth.user.id,
    email: auth.user.email ?? null,
    fullName: profile?.full_name ?? null,
    role: (profile?.role as UserRole) ?? 'competitor',
  };
}

/** Rol → Türkçe etiket (UI'da gösterilir). */
export const ROLE_LABEL: Record<UserRole, string> = {
  competitor: 'YARIŞMACI',
  judge: 'HAKEM',
  evaluation_admin: 'DEĞERLENDİRME YÖNETİCİSİ',
  competition_admin: 'YARIŞMA YÖNETİCİSİ',
};

/** Rol → giriş sonrası varsayılan ekran (PLAN.md §6). */
export const ROLE_HOME: Record<UserRole, string> = {
  competitor: '/submissions',
  judge: '/review',
  evaluation_admin: '/evaluation',
  competition_admin: '/admin/competitions',
};

/**
 * Rol koruması (PLAN.md §6 RoleGuard).
 *
 * Middleware yalnızca "giriş var mı"yı kontrol ediyor; ROL kontrolü burada.
 * RLS zaten veriyi koruyor — bu katman kullanıcıyı yetkisiz bir ekranda boş
 * sayfayla baş başa bırakmamak için, yani UX katmanı. Güvenlik RLS'te.
 */
export async function requireRole(allowed: UserRole[]): Promise<SessionUser> {
  const { redirect } = await import('next/navigation');
  const user = await currentUser();
  // redirect() never döndürür ama TS bunu import edilmiş çağrıda anlamıyor.
  if (!user) return redirect('/auth');
  if (!allowed.includes(user.role)) return redirect(ROLE_HOME[user.role]);
  return user;
}
