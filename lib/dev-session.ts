/**
 * GEÇİCİ — auth bağlanana kadar "şu an giriş yapmış kullanıcı" (PLAN.md Gün 1).
 *
 * Gerçek akışta bu bilgi Supabase Auth oturumundan gelecek. Şimdilik seed
 * edilmiş sabit test hesapları kullanılıyor ki yükleme → analiz → hakem
 * zinciri auth'u beklemeden uçtan uca çalışabilsin.
 *
 * ⚠️ Auth bağlandığında bu dosya SİLİNMELİ. docs/NOTES.md'de takipte.
 */
export const DEV_USERS = {
  competitor: { email: 'yarismaci@zema.test', fullName: 'Mehmet Şahin' },
  judge: { email: 'hakem@zema.test', fullName: 'Zeynep Demir' },
} as const;

export const DEV_TEAM_NAME = 'GARO';
export const DEV_COMPETITION_NAME = 'TEKNOFEST 2026 — İnsansız Hava Araçları';
