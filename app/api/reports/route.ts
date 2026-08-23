import { NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';

/**
 * POST /api/reports — rapor yükleme (PLAN.md §2)
 *
 *   PDF → Supabase Storage → unpdf ile metin çıkarımı → reports satırı
 *       → analysis_jobs'a 6 pending iş
 *
 * Kullanıcı kimliği oturumdan geliyor; takım üyeliği DB'den doğrulanıyor.
 * Storage yazımı ve rapor kaydı service_role ile yapılıyor çünkü metin
 * çıkarımı + kuyruk açma sistem işi — ama HANGİ takım adına yazılacağı
 * oturumdan belirleniyor, istemciden gelen veriye güvenilmiyor.
 */

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(req: Request) {
  const db = supabaseAdmin();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'multipart/form-data bekleniyor' }, { status: 400 });
  }

  const file = form.get('file');
  const title = String(form.get('title') ?? '').trim();
  const categoryId = String(form.get('category_id') ?? '').trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file alanı zorunlu' }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: 'title alanı zorunlu' }, { status: 400 });
  }
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json(
      { error: `Yalnızca PDF kabul ediliyor (gelen: ${file.type})` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Dosya 20 MB sınırını aşıyor' }, { status: 413 });
  }

  // ── Oturumdaki kullanıcı → takım ──
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Giriş yapmalısınız.' }, { status: 401 });
  }
  if (user.role !== 'competitor') {
    return NextResponse.json(
      { error: 'Yalnızca yarışmacılar rapor yükleyebilir.' },
      { status: 403 },
    );
  }
  const profileRow = { id: user.id };

  const { data: membership, error: me } = await db
    .from('team_members')
    .select('team_id, teams(id, competition_id)')
    .eq('user_id', user.id)
    .maybeSingle();
  if (me || !membership) {
    return NextResponse.json({ error: 'Kullanıcı bir takıma bağlı değil' }, { status: 409 });
  }
  const team = membership.teams as unknown as { id: string; competition_id: string };

  // ── PDF metnini çıkar (§2: unpdf) ──
  const bytes = new Uint8Array(await file.arrayBuffer());
  // ⚠️ pdf.js (unpdf'in altında) verdiğimiz ArrayBuffer'ı DETACH ediyor.
  // Storage'a yüklenecek kopyayı ayrıştırmadan ÖNCE al, yoksa
  // "Cannot perform ArrayBuffer.prototype.slice on a detached ArrayBuffer".
  const bytesForUpload = Uint8Array.from(bytes);
  let extracted: string;
  let pageCount: number;
  try {
    const pdf = await getDocumentProxy(bytes);
    pageCount = pdf.numPages;
    const { text } = await extractText(pdf, { mergePages: true });
    extracted = (Array.isArray(text) ? text.join('\n') : text).trim();
  } catch (e) {
    return NextResponse.json(
      { error: `PDF okunamadı: ${e instanceof Error ? e.message : 'bilinmeyen hata'}` },
      { status: 422 },
    );
  }

  if (extracted.length < 200) {
    // Taranmış (görüntü) PDF olabilir — OCR kapsam dışı (PLAN.md §8).
    return NextResponse.json(
      {
        error:
          'PDF içinden anlamlı metin çıkarılamadı. Taranmış görüntü PDF olabilir; ' +
          'metin katmanı içeren bir PDF yükleyin.',
        extracted_chars: extracted.length,
      },
      { status: 422 },
    );
  }

  const wordCount = extracted.split(/\s+/).filter(Boolean).length;

  // ── Storage: <team_id>/<uuid>.pdf (0002_rls.sql'deki yol kuralı) ──
  const filePath = `${team.id}/${crypto.randomUUID()}.pdf`;
  const { error: se } = await db.storage
    .from('reports')
    .upload(filePath, bytesForUpload, { contentType: 'application/pdf', upsert: false });
  if (se) {
    return NextResponse.json({ error: `Storage yükleme hatası: ${se.message}` }, { status: 500 });
  }

  // ── reports satırı ──
  const { data: report, error: re } = await db
    .from('reports')
    .insert({
      competition_id: team.competition_id,
      category_id: categoryId || null,
      team_id: team.id,
      title,
      file_path: filePath,
      extracted_text: extracted,
      page_count: pageCount,
      word_count: wordCount,
      status: 'analyzing',
      submitted_at: new Date().toISOString(),
    })
    .select('id, title, page_count, word_count')
    .single();

  if (re) {
    // Satır yazılamadıysa yüklenen dosyayı bırakmayalım.
    await db.storage.from('reports').remove([filePath]);
    return NextResponse.json({ error: `Rapor kaydedilemedi: ${re.message}` }, { status: 500 });
  }

  // ── 6 kontrol işini kuyruğa al (§2.1) ──
  const { data: queued, error: qe } = await db.rpc('enqueue_report_checks', {
    p_report_id: report.id,
  });
  if (qe) {
    return NextResponse.json(
      { error: `İşler kuyruğa alınamadı: ${qe.message}`, report_id: report.id },
      { status: 500 },
    );
  }

  await db.from('audit_log').insert({
    actor: profileRow.id,
    action: 'report.submitted',
    entity: 'reports',
    entity_id: report.id,
    meta: { page_count: pageCount, word_count: wordCount, queued },
  });

  return NextResponse.json({
    report_id: report.id,
    title: report.title,
    page_count: report.page_count,
    word_count: report.word_count,
    extracted_chars: extracted.length,
    jobs_queued: queued,
  });
}
