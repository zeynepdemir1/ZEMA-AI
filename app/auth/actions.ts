'use server';

/**
 * Kayıt kodu doğrulama — PLAN.md §3.2
 *
 * ⚠️ Tasarım prototipinde bu eşleme istemci tarafındaki JS'in içinde sabitti.
 * Öyle bırakılamaz: kodlar tarayıcı paketine girer ve herkes hakem/yönetici
 * hesabı açabilir. PLAN.md §8 bunu "asla kesme" listesine koyuyor
 * ("kayıt kodu mekanizması — güvenlik açığı olur").
 *
 * Bu yüzden doğrulama bir server action'a taşındı: kodlar yalnızca sunucuda
 * okunur, istemciye sadece atanacak rolün ADI döner.
 */

const ROLE_LABELS = {
  judge: 'Hakem',
  competition_admin: 'Yarışma Yöneticisi',
  evaluation_admin: 'Değerlendirme Yöneticisi',
} as const;

export type CodeCheck =
  | { state: 'empty' }
  | { state: 'valid'; roleLabel: string }
  | { state: 'invalid' };

export async function checkRegistrationCode(raw: string): Promise<CodeCheck> {
  const code = raw.trim().toUpperCase();
  if (!code) return { state: 'empty' };

  // Boş/tanımsız env değişkeni asla eşleşmesin — yoksa boş kod her rolü açardı.
  const table: Array<[string | undefined, keyof typeof ROLE_LABELS]> = [
    [process.env.REGISTRATION_CODE_JUDGE, 'judge'],
    [process.env.REGISTRATION_CODE_COMPETITION_ADMIN, 'competition_admin'],
    [process.env.REGISTRATION_CODE_EVALUATION_ADMIN, 'evaluation_admin'],
  ];

  for (const [secret, role] of table) {
    if (secret && secret.trim() && code === secret.trim().toUpperCase()) {
      return { state: 'valid', roleLabel: ROLE_LABELS[role] };
    }
  }
  return { state: 'invalid' };
}
