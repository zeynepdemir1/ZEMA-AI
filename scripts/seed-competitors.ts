/**
 * Ek yarışmacı hesaplarını ve takımlarını açar.
 *
 * Katılım kuralına uyar: her kullanıcı bir yarışmada TEK takımın üyesi.
 * Fikirdeş (idempotent) — var olan hesabı/takımı yeniden oluşturmaz.
 *
 * Rapor OLUŞTURMUYOR: katman 1 kuralı bir takıma bir yarışmada tek rapor
 * izni veriyor; hangi raporun yüklenmesi gereken demo senaryosuna bağlı,
 * betiğin karar vermesi gereken bir şey değil.
 *
 * Çalıştırma:  npx tsx scripts/seed-competitors.ts
 */
import { createClient } from '@supabase/supabase-js';
import { DEV_PASSWORD, EXTRA_COMPETITORS } from '../lib/dev-session';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli');
const db = createClient(url, key, { auth: { persistSession: false } });

async function upsertCompetitor(email: string, fullName: string): Promise<string> {
  const { data: list, error: le } = await db.auth.admin.listUsers({ perPage: 200 });
  if (le) throw new Error(`listUsers: ${le.message}`);
  let user = list.users.find((u) => u.email === email);

  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: DEV_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`createUser(${email}): ${error.message}`);
    user = data.user;
    console.log(`  oluşturuldu: ${email} — ${fullName}`);
  } else {
    await db.auth.admin.updateUserById(user.id, { password: DEV_PASSWORD });
    console.log(`  zaten var:   ${email} (şifre yenilendi)`);
  }

  const { error: pe } = await db.from('profiles').upsert(
    { id: user.id, role: 'competitor', full_name: fullName, kvkk_consent_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  if (pe) throw new Error(`profiles upsert(${email}): ${pe.message}`);
  return user.id;
}

/**
 * 0008 çalıştırılmadıysa founded_year kolonu yok — kolonsuz tekrar dene.
 * PostgREST şema önbelleği kolonu görmezse code 42703 DEĞİL PGRST204
 * dönüyor; ilk sürüm bunu kaçırdı.
 */
async function createTeam(competitionId: string, name: string, foundedYear: number) {
  const full = await db
    .from('teams')
    .insert({ competition_id: competitionId, name, founded_year: foundedYear })
    .select('id')
    .single();
  if (full.error && (full.error.code === '42703' || full.error.code === 'PGRST204' || /founded_year/.test(full.error.message))) {
    console.log('    (founded_year kolonu yok — 0008 çalıştırılmamış, yılsız açılıyor)');
    const fb = await db
      .from('teams')
      .insert({ competition_id: competitionId, name })
      .select('id')
      .single();
    if (fb.error) throw new Error(`teams insert: ${fb.error.message}`);
    return fb.data.id;
  }
  if (full.error) throw new Error(`teams insert: ${full.error.message}`);
  return full.data.id;
}

async function main() {
  const { data: comps } = await db.from('competitions').select('id, name');
  const byName = new Map((comps ?? []).map((c) => [c.name, c.id]));

  console.log('=== Ek yarışmacı hesapları ===');
  for (const c of EXTRA_COMPETITORS) {
    const userId = await upsertCompetitor(c.email, c.fullName);
    const competitionId = byName.get(c.competition);
    if (!competitionId) {
      console.log(`    ⚠️ yarışma bulunamadı: ${c.competition} — takım açılmadı`);
      continue;
    }

    // KATILIM KURALI (katman 2): bu yarışmada zaten takımı var mı?
    const { data: mine } = await db
      .from('team_members')
      .select('teams(id, name, competition_id)')
      .eq('user_id', userId);
    const existing = (mine ?? [])
      .map((m) => m.teams as unknown as { id: string; name: string; competition_id: string })
      .find((t) => t?.competition_id === competitionId);
    if (existing) {
      console.log(`    takım zaten var: ${existing.name} (${c.competition})`);
      continue;
    }

    const { data: dup } = await db
      .from('teams')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('name', c.teamName)
      .maybeSingle();
    const teamId = dup ? dup.id : await createTeam(competitionId, c.teamName, c.foundedYear);
    const { error: me } = await db.from('team_members').insert({ team_id: teamId, user_id: userId });
    if (me) throw new Error(`team_members insert: ${me.message}`);
    console.log(`    takım açıldı: ${c.teamName} (${c.competition}, kuruluş ${c.foundedYear})`);
  }

  console.log('\n=== Yarışmacı → takım → yarışma ===');
  const { data: profs } = await db
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'competitor')
    .order('full_name');
  for (const p of profs ?? []) {
    const { data: ms } = await db
      .from('team_members')
      .select('teams(name, competition_id)')
      .eq('user_id', p.id);
    const rows = (ms ?? []).map((m) => m.teams as unknown as { name: string; competition_id: string });
    const per = new Map<string, string[]>();
    for (const t of rows) {
      const cname = (comps ?? []).find((c) => c.id === t.competition_id)?.name ?? '?';
      per.set(cname, [...(per.get(cname) ?? []), t.name]);
    }
    console.log(`  ${p.full_name}`);
    for (const [cname, names] of per) {
      const flag = names.length > 1 ? '  ⚠️ KURAL 2 İHLALİ' : '';
      console.log(`      ${cname.slice(0, 40).padEnd(42)} ${names.join(', ')}${flag}`);
    }
  }
  console.log(`\n  Giriş: <email> / ${DEV_PASSWORD}`);
}

main().catch((e) => {
  console.error('HATA:', e.message);
  process.exit(1);
});
