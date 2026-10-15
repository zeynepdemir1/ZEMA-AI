/**
 * Demo hesaplarının şifresini DEMO_PASSWORD'e çevirir — başka hiçbir şeye
 * dokunmaz (profil, takım, rapor yok; seed'in aksine).
 *
 * NEDEN: eski sabit şifre herkese açık repoda, git geçmişinde duruyor.
 * Geçmişi yeniden yazmak force-push ve etiket taşımak demek; onun yerine
 * şifre değiştirilerek sızan değer geçersiz kılınıyor.
 *
 * Çalıştırma:  npm run rotate:demo-password
 * Sonra: aynı DEMO_PASSWORD Vercel'de de olmalı, yoksa "Profil seç" çalışmaz.
 */
import { supabaseAdmin } from '../lib/supabase/admin';
import { demoPassword, DEV_USERS, EXTRA_COMPETITORS, EXTRA_JUDGES } from '../lib/dev-session';

const EMAILS = [
  ...Object.values(DEV_USERS).map((u) => u.email),
  ...EXTRA_JUDGES.map((u) => u.email),
  ...EXTRA_COMPETITORS.map((u) => u.email),
];

async function main() {
  const password = demoPassword();
  // Güvenlik: yalnızca sahte demo alan adı. Gerçek bir hesaba asla dokunma.
  if (EMAILS.some((e) => !e.endsWith('@zema.test'))) throw new Error('Demo dışı e-posta listede.');

  const db = supabaseAdmin();
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);

  let changed = 0;
  for (const email of EMAILS) {
    const user = data.users.find((u) => u.email === email);
    if (!user) {
      console.log(`  yok, atlandı: ${email}`);
      continue;
    }
    const { error: ue } = await db.auth.admin.updateUserById(user.id, { password });
    if (ue) throw new Error(`${email}: ${ue.message}`);
    changed++;
    console.log(`  şifre değişti: ${email}`);
  }
  console.log(`\n${changed}/${EMAILS.length} demo hesabı güncellendi.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
