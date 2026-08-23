/**
 * §9 demo veri seti — PDF üret, yükle, kuyruğa al.
 *
 * Analizi ÇALIŞTIRMAZ; kuyruğu açar. Analiz `npm run demo:analyze` ile
 * ayrı çalıştırılır çünkü gerçek model çağrıları yavaş ve kotalı.
 *
 * Çalıştırma: npm run demo:seed
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { supabaseAdmin } from '../lib/supabase/admin';
import { DEV_COMPETITION_NAME } from '../lib/dev-session';
import { DEMO_REPORTS, type DemoReport } from './demo-reports';

const OUT = 'scripts/fixtures/demo';
const db = supabaseAdmin();

function html(r: DemoReport): string {
  const body = r.sections
    .map(([h, p]) => `<h2>${h}</h2>\n<p>${p}</p>`)
    .join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{font-family:'DejaVu Sans',sans-serif;font-size:11pt;line-height:1.55}
h1{font-size:15pt;margin-bottom:4pt} h2{font-size:12pt;margin-top:16pt}
.meta{font-size:10pt;color:#333}</style></head><body>
<h1>${r.title}</h1>
<p class="meta"><b>Takım:</b> ${r.team} &nbsp;|&nbsp; <b>Kategori:</b> ${r.category} &nbsp;|&nbsp; <b>Yıl:</b> 2026</p>
${body}
</body></html>`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // Yarışma + kategoriler + takım sahibi
  const { data: competition } = await db
    .from('competitions')
    .select('id')
    .eq('name', DEV_COMPETITION_NAME)
    .single();
  const { data: categories } = await db
    .from('categories')
    .select('id, name')
    .eq('competition_id', competition!.id);
  const catId = new Map((categories ?? []).map((c) => [c.name, c.id]));

  const { data: competitor } = await db
    .from('profiles')
    .select('id')
    .eq('role', 'competitor')
    .limit(1)
    .single();

  console.log('=== 1) PDF üretimi (LibreOffice) ===');
  const files: Array<{ r: DemoReport; pdf: string }> = [];
  for (const r of DEMO_REPORTS) {
    const htmlPath = `${OUT}/${r.key}.html`;
    writeFileSync(htmlPath, html(r));
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', OUT, htmlPath], {
      stdio: 'ignore',
      timeout: 120_000,
    });
    files.push({ r, pdf: `${OUT}/${r.key}.pdf` });
    console.log(`  ${r.key} · ${r.team} · ${r.title.slice(0, 44)}`);
  }

  console.log('\n=== 2) Takımlar ===');
  const teamId = new Map<string, string>();
  for (const { r } of files) {
    const { data: ex } = await db
      .from('teams')
      .select('id')
      .eq('competition_id', competition!.id)
      .eq('name', r.team)
      .maybeSingle();
    if (ex) {
      teamId.set(r.team, ex.id);
      continue;
    }
    const { data, error } = await db
      .from('teams')
      .insert({ competition_id: competition!.id, name: r.team })
      .select('id')
      .single();
    if (error) throw new Error(`teams(${r.team}): ${error.message}`);
    teamId.set(r.team, data.id);
    // Yarışmacı test hesabını her takıma ekle — /submissions ekranı tek
    // hesapla tüm demo raporlarını gösterebilsin.
    await db
      .from('team_members')
      .upsert({ team_id: data.id, user_id: competitor!.id }, { onConflict: 'team_id,user_id' });
    console.log(`  ${r.team} oluşturuldu`);
  }

  console.log('\n=== 3) Yükleme + metin çıkarımı ===');
  const { extractText, getDocumentProxy } = await import('unpdf');
  const created: Array<{ key: string; id: string }> = [];

  for (const { r, pdf } of files) {
    const tid = teamId.get(r.team)!;
    // Aynı takım+başlık zaten varsa atla (idempotent)
    const { data: dup } = await db
      .from('reports')
      .select('id')
      .eq('team_id', tid)
      .eq('title', r.title)
      .maybeSingle();
    if (dup) {
      created.push({ key: r.key, id: dup.id });
      console.log(`  ${r.key} zaten var`);
      continue;
    }

    const bytes = new Uint8Array(readFileSync(pdf));
    const forUpload = Uint8Array.from(bytes);
    const proxy = await getDocumentProxy(bytes);
    const { text } = await extractText(proxy, { mergePages: true });
    const extracted = (Array.isArray(text) ? text.join('\n') : text).trim();

    const filePath = `${tid}/${crypto.randomUUID()}.pdf`;
    const { error: se } = await db.storage
      .from('reports')
      .upload(filePath, forUpload, { contentType: 'application/pdf' });
    if (se) throw new Error(`storage(${r.key}): ${se.message}`);

    const { data: report, error } = await db
      .from('reports')
      .insert({
        competition_id: competition!.id,
        category_id: catId.get(r.category) ?? null,
        team_id: tid,
        title: r.title,
        file_path: filePath,
        extracted_text: extracted,
        page_count: proxy.numPages,
        word_count: extracted.split(/\s+/).filter(Boolean).length,
        status: 'analyzing',
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw new Error(`reports(${r.key}): ${error.message}`);

    const { data: queued } = await db.rpc('enqueue_report_checks', { p_report_id: report.id });
    created.push({ key: r.key, id: report.id });
    console.log(
      `  ${r.key} · ${proxy.numPages} sayfa · ${extracted.length} krk · ${queued} iş kuyruğa alındı`,
    );
  }

  console.log('\n=== 4) Hakem ataması ===');
  const { data: judges } = await db.from('profiles').select('id, full_name').eq('role', 'judge');
  if (!judges?.length) throw new Error('hakem yok — npm run seed');
  const rows = created.map((c, i) => ({
    report_id: c.id,
    judge_id: judges[i % judges.length].id,
    assigned_by: judges[0].id,
    status: 'pending',
  }));
  await db.from('assignments').upsert(rows, { onConflict: 'report_id,judge_id' });
  console.log(`  ${rows.length} rapor atandı`);

  console.log('\n=== ÖZET ===');
  for (const { key, id } of created) {
    const r = DEMO_REPORTS.find((x) => x.key === key)!;
    console.log(`  ${key}  ${id}  ${r.triggers}`);
  }
  const { count } = await db
    .from('analysis_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  console.log(`\n  kuyrukta bekleyen iş: ${count}`);
  console.log('  sıradaki adım: npm run demo:analyze');
}

main()
  .then(() => console.log('\n✓ demo seed tamam'))
  .catch((e) => {
    console.error('\n✗ demo seed başarısız:', e.message);
    process.exit(1);
  });
