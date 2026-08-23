/**
 * ZEMA — seed betiği (idempotent)
 *
 * PLAN.md §0.3: "Gerçek TEKNOFEST rubriği yoksa demo için makul bir rubrik
 * seed'lenir." Değerler bilinçli olarak lib/design/mock-data.ts ile aynı —
 * ekranlar DB'ye bağlandığında görüntü değişmesin.
 *
 * Çalıştırma:  npm run seed
 */
import { supabaseAdmin } from '../lib/supabase/admin';
import { CARDS, CRITERIA_LIST, DEFAULT_SIMILARITY_THRESHOLD } from '../lib/design/mock-data';
import { DEV_COMPETITION_NAME, DEV_PASSWORD, DEV_TEAM_NAME, DEV_USERS } from '../lib/dev-session';

const db = supabaseAdmin();

const CATEGORIES = [
  {
    name: 'Sabit Kanat',
    // Açıklama category_fit kontrolünün sınıflandırma girdisi — dolu tutulmalı (§3).
    description:
      'Sabit kanatlı insansız hava aracı tasarımları. Kanat profili, kalkış-iniş mesafesi, ' +
      'menzil ve seyir verimliliği ön plandadır. Uzun menzilli gözetleme ve kargo görevleri.',
  },
  {
    name: 'Döner Kanat',
    description:
      'Multirotor ve helikopter tipi insansız hava araçları. Havada sabit kalma (hover), ' +
      'dikey kalkış-iniş, kısa mesafe manevra kabiliyeti ve yük taşıma kapasitesi öne çıkar.',
  },
  {
    name: 'Serbest Görev',
    description:
      'Belirli bir platform sınıfına girmeyen özgün görev tanımları. Hibrit tasarımlar, ' +
      'sürü uygulamaları, otonom karar verme ve alışılmadık faydalı yük çözümleri.',
  },
];

/** PLAN.md §4.1: şablon kontrolü bu spec'e karşı yapılır. */
const TEMPLATE_SPEC = {
  required_sections: [
    'Problem Tanımı',
    'Literatür Taraması',
    'Yöntem ve Sistem Mimarisi',
    'Test ve Doğrulama',
    'Zaman Planı ve Bütçe',
    'Sonuç',
    'Kaynakça',
  ],
  max_pages: 25,
  language: 'tr',
  citation_format: 'IEEE',
};

type Role = 'competitor' | 'judge' | 'evaluation_admin' | 'competition_admin';

async function upsertUser(email: string, fullName: string, role: Role) {
  // Zaten var mı? (createUser aynı e-postayla ikinci kez hata verir)
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
    console.log(`  auth kullanıcısı oluşturuldu: ${email}`);
  } else {
    // Şifreyi bilinen değere sabitle — manuel test için.
    await db.auth.admin.updateUserById(user.id, { password: DEV_PASSWORD });
    console.log(`  auth kullanıcısı zaten var: ${email} (şifre yenilendi)`);
  }

  // profiles satırı — rol ataması service_role ile yapılır (§3.2)
  const { error: pe } = await db.from('profiles').upsert(
    { id: user.id, role, full_name: fullName, kvkk_consent_at: new Date().toISOString() },
    { onConflict: 'id' },
  );
  if (pe) throw new Error(`profiles upsert: ${pe.message}`);
  return user.id;
}

async function main() {
  console.log('=== 1) Test hesapları ===');
  const competitorId = await upsertUser(
    DEV_USERS.competitor.email,
    DEV_USERS.competitor.fullName,
    'competitor',
  );
  const judgeId = await upsertUser(DEV_USERS.judge.email, DEV_USERS.judge.fullName, 'judge');
  await upsertUser(
    DEV_USERS.evaluationAdmin.email,
    DEV_USERS.evaluationAdmin.fullName,
    'evaluation_admin',
  );
  await upsertUser(
    DEV_USERS.competitionAdmin.email,
    DEV_USERS.competitionAdmin.fullName,
    'competition_admin',
  );

  console.log('\n=== 2) Yarışma ===');
  const { data: existing } = await db
    .from('competitions')
    .select('id')
    .eq('name', DEV_COMPETITION_NAME)
    .maybeSingle();

  let competitionId = existing?.id as string | undefined;
  if (!competitionId) {
    const { data, error } = await db
      .from('competitions')
      .insert({
        name: DEV_COMPETITION_NAME,
        year: 2026,
        language: 'tr',
        template_spec: TEMPLATE_SPEC,
        similarity_threshold: DEFAULT_SIMILARITY_THRESHOLD,
        submission_deadline: '2026-09-30T23:59:00Z',
        created_by: judgeId,
      })
      .select('id')
      .single();
    if (error) throw new Error(`competitions: ${error.message}`);
    competitionId = data.id;
    console.log(`  oluşturuldu: ${DEV_COMPETITION_NAME}`);
  } else {
    console.log(`  zaten var: ${DEV_COMPETITION_NAME}`);
  }

  console.log('\n=== 3) Kategoriler ===');
  const categoryIds: Record<string, string> = {};
  for (const c of CATEGORIES) {
    const { data: ex } = await db
      .from('categories')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('name', c.name)
      .maybeSingle();
    if (ex) {
      categoryIds[c.name] = ex.id;
      console.log(`  zaten var: ${c.name}`);
      continue;
    }
    const { data, error } = await db
      .from('categories')
      .insert({ competition_id: competitionId, ...c })
      .select('id')
      .single();
    if (error) throw new Error(`categories(${c.name}): ${error.message}`);
    categoryIds[c.name] = data.id;
    console.log(`  oluşturuldu: ${c.name}`);
  }

  console.log('\n=== 4) Kriterler (rubrik) ===');
  // Ağırlıklar CRITERIA_LIST'ten (%15..%10), beklenti metinleri CARDS'tan.
  for (const k of CRITERIA_LIST) {
    const card = CARDS.find((c) => c.code === k.code);
    const weight = Number(k.weight.replace('%', '')) / 100;
    const { data: ex } = await db
      .from('criteria')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('name', `${k.code} · ${k.title}`)
      .maybeSingle();
    if (ex) {
      console.log(`  zaten var: ${k.code}`);
      continue;
    }
    const { error } = await db.from('criteria').insert({
      competition_id: competitionId,
      category_id: null, // tüm kategoriler için geçerli
      name: `${k.code} · ${k.title}`,
      description: card?.beklenti ?? k.title,
      max_score: 10,
      weight,
      sort_order: Number(k.code.split('-')[1]),
    });
    if (error) throw new Error(`criteria(${k.code}): ${error.message}`);
    console.log(`  oluşturuldu: ${k.code} · ${k.title} (ağırlık ${weight})`);
  }

  console.log('\n=== 5) Takım ===');
  const { data: exTeam } = await db
    .from('teams')
    .select('id')
    .eq('competition_id', competitionId)
    .eq('name', DEV_TEAM_NAME)
    .maybeSingle();

  let teamId = exTeam?.id as string | undefined;
  if (!teamId) {
    const { data, error } = await db
      .from('teams')
      .insert({ competition_id: competitionId, name: DEV_TEAM_NAME })
      .select('id')
      .single();
    if (error) throw new Error(`teams: ${error.message}`);
    teamId = data.id;
    console.log(`  oluşturuldu: ${DEV_TEAM_NAME}`);
  } else {
    console.log(`  zaten var: ${DEV_TEAM_NAME}`);
  }

  const { error: tme } = await db
    .from('team_members')
    .upsert({ team_id: teamId, user_id: competitorId }, { onConflict: 'team_id,user_id' });
  if (tme) throw new Error(`team_members: ${tme.message}`);
  console.log(`  ${DEV_USERS.competitor.fullName} takıma eklendi`);

  // ── 6) Mevcut raporları hakeme ata ──────────────────────────
  // RLS devreye girdiğinde hakem YALNIZCA atandığı raporları görebiliyor
  // (reports_select_judge). Atama olmadan hakem ekranı boş kalır.
  // Atama ekranı (/evaluation/assignments) henüz yok, o yüzden seed yapıyor.
  console.log('\n=== 6) Hakem atamaları ===');
  const { data: existingReports } = await db
    .from('reports')
    .select('id')
    .eq('competition_id', competitionId);

  if (!existingReports?.length) {
    console.log('  rapor yok, atama yapılmadı');
  } else {
    const rows = existingReports.map((r) => ({
      report_id: r.id,
      judge_id: judgeId,
      assigned_by: judgeId,
      status: 'pending',
    }));
    const { error } = await db
      .from('assignments')
      .upsert(rows, { onConflict: 'report_id,judge_id' });
    if (error) throw new Error(`assignments: ${error.message}`);
    console.log(`  ${rows.length} rapor ${DEV_USERS.judge.fullName}'e atandı`);
  }

  console.log('\n=== ÖZET ===');
  console.log('  competition_id:', competitionId);
  console.log('  team_id       :', teamId);
  console.log('  competitor_id :', competitorId);
  console.log('  judge_id      :', judgeId);
  console.log('  kategoriler   :', Object.entries(categoryIds).map(([n, i]) => `${n}=${i.slice(0, 8)}`).join(', '));
}

main()
  .then(() => console.log('\n✓ seed tamam'))
  .catch((e) => {
    console.error('\n✗ seed başarısız:', e.message);
    process.exit(1);
  });
