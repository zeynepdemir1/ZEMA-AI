/**
 * Seed edilen sabit test hesapları.
 *
 * Auth bağlandı — bunlar artık "giriş yapılmış kullanıcı" taklidi DEĞİL,
 * yalnızca seed'in ve manuel testin kullandığı bilinen hesaplar.
 * Şifreleri seed sırasında `zema-test-2026` olarak ayarlanır.
 *
 * Şartname 4 farklı kullanıcı rolü istiyor; dördü de burada.
 */
export const DEV_USERS = {
  competitor: { email: 'yarismaci@zema.test', fullName: 'Mehmet Şahin', role: 'competitor' },
  judge: { email: 'hakem@zema.test', fullName: 'Zeynep Demir', role: 'judge' },
  evaluationAdmin: { email: 'degerlendirme@zema.test', fullName: 'Ayşe Yılmaz', role: 'evaluation_admin' },
  competitionAdmin: { email: 'yarisma@zema.test', fullName: 'Mert Kaya', role: 'competition_admin' },
} as const;

export const DEV_PASSWORD = 'zema-test-2026';
export const DEV_TEAM_NAME = 'GARO';
export const DEV_COMPETITION_NAME = 'TEKNOFEST 2026 — İnsansız Hava Araçları';
