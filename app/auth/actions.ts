'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ROLE_HOME, supabaseServer, type UserRole } from '@/lib/supabase/server';

/**
 * Kayıt kodu ile rol atama + giriş/çıkış (PLAN.md §3.2)
 *
 * Kodların GERÇEK değerleri yalnızca sunucuda okunur; istemciye hiçbir zaman
 * gitmez. Prototipte bu eşleme istemci JS'inde sabitti — güvenlik açığıydı.
 */

const ROLE_LABELS: Record<Exclude<UserRole, 'competitor'>, string> = {
  judge: 'Hakem',
  competition_admin: 'Yarışma Yöneticisi',
  evaluation_admin: 'Değerlendirme Yöneticisi',
};

export type CodeCheck =
  | { state: 'empty' }
  | { state: 'valid'; roleLabel: string }
  | { state: 'invalid' };

function roleForCode(raw: string): Exclude<UserRole, 'competitor'> | null {
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  const table: Array<[string | undefined, Exclude<UserRole, 'competitor'>]> = [
    [process.env.REGISTRATION_CODE_JUDGE, 'judge'],
    [process.env.REGISTRATION_CODE_COMPETITION_ADMIN, 'competition_admin'],
    [process.env.REGISTRATION_CODE_EVALUATION_ADMIN, 'evaluation_admin'],
  ];
  for (const [secret, role] of table) {
    // Boş env değişkeni ASLA eşleşmesin, yoksa boş kod her rolü açardı.
    if (secret && secret.trim() && code === secret.trim().toUpperCase()) return role;
  }
  return null;
}

/** Kayıt ekranındaki canlı geri bildirim. Yalnızca rolün ADINI döndürür. */
export async function checkRegistrationCode(raw: string): Promise<CodeCheck> {
  if (!raw.trim()) return { state: 'empty' };
  const role = roleForCode(raw);
  return role ? { state: 'valid', roleLabel: ROLE_LABELS[role] } : { state: 'invalid' };
}

export type AuthResult = { ok: false; error: string } | { ok: true; redirectTo: string };

export async function signUp(formData: FormData): Promise<AuthResult> {
  const fullName = String(formData.get('full_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const code = String(formData.get('code') ?? '').trim();
  const kvkk = formData.get('kvkk') === 'on';

  if (!fullName) return { ok: false, error: 'Ad soyad zorunlu.' };
  if (!email.includes('@')) return { ok: false, error: 'Geçerli bir e-posta girin.' };
  if (password.length < 8) return { ok: false, error: 'Şifre en az 8 karakter olmalı.' };
  // §3.2: onay verilmeden kayıt TAMAMLANMAZ.
  if (!kvkk) return { ok: false, error: 'KVKK aydınlatma metnini onaylamanız gerekiyor.' };

  let role: UserRole = 'competitor';
  if (code) {
    const matched = roleForCode(code);
    if (!matched) return { ok: false, error: 'Geçersiz kayıt kodu.' };
    role = matched;
  }

  // Kullanıcı oluşturma admin ile yapılıyor: rol ataması istemciye
  // bırakılamaz ve profiles'a insert politikası bilinçli olarak yok.
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // MVP: e-posta doğrulama akışı yok
    user_metadata: { full_name: fullName },
  });
  if (error) {
    const msg = /already been registered|already exists/i.test(error.message)
      ? 'Bu e-posta ile bir hesap zaten var.'
      : error.message;
    return { ok: false, error: msg };
  }

  const { error: pe } = await admin.from('profiles').upsert(
    { id: data.user.id, role, full_name: fullName, kvkk_consent_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  if (pe) return { ok: false, error: `Profil oluşturulamadı: ${pe.message}` };

  await admin.from('audit_log').insert({
    actor: data.user.id,
    action: 'auth.signed_up',
    entity: 'profiles',
    entity_id: data.user.id,
    meta: { role, via_code: Boolean(code) },
  });

  // Kayıttan sonra otomatik giriş yap.
  const db = await supabaseServer();
  const { error: se } = await db.auth.signInWithPassword({ email, password });
  if (se) return { ok: false, error: 'Hesap oluşturuldu ama giriş yapılamadı. Giriş sekmesini kullanın.' };

  revalidatePath('/', 'layout');
  return { ok: true, redirectTo: ROLE_HOME[role] };
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '').trim();

  if (!email || !password) return { ok: false, error: 'E-posta ve şifre zorunlu.' };

  const db = await supabaseServer();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      ok: false,
      error: /invalid login/i.test(error.message)
        ? 'E-posta veya şifre hatalı.'
        : error.message,
    };
  }

  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();
  const role = (profile?.role as UserRole) ?? 'competitor';

  revalidatePath('/', 'layout');
  // `next` yalnızca uygulama içi bir yol olabilir (open redirect koruması).
  const target = next.startsWith('/') && !next.startsWith('//') ? next : ROLE_HOME[role];
  return { ok: true, redirectTo: target };
}

export async function signOut() {
  const db = await supabaseServer();
  await db.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
