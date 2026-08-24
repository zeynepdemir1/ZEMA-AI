import { NextResponse } from 'next/server';
import { extractText, getDocumentProxy } from 'unpdf';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { pathBelongsToTeam, resolveUploaderTeam } from '@/lib/reports/upload';

/**
 * POST /api/reports — rapor yükleme (PLAN.md §2)
 *
 *   PDF → Supabase Storage → unpdf ile metin çıkarımı → reports satırı
 *       → analysis_jobs'a 6 pending iş
 *
 * İKİ GİRİŞ BİÇİMİ:
 *
 *  1. application/json { file_path, title, category_id }  ← TERCİH EDİLEN
 *     Dosya tarayıcıdan doğrudan Storage'a yüklenmiş; burada yalnızca yolu
 *     geliyor. Sebep: Vercel'de serverless fonksiyonların istek gövdesi
 *     4,5 MB ile sınırlı. 20 MB'lık bir sınır ilan edip PDF'i kendi
 *     fonksiyonumuzdan geçirmek, üretimde 5 MB'lık bir ÖTR'de bile
 *     platformun kendi (JSON olmayan) hatasıyla çökmek demekti.
 *
 *  2. multipart/form-data  ← geriye dönük uyumluluk ve sunucu tarafı testler
 *     Yerelde ve curl ile çalışır; üretimde 4,5 MB üstü dosyalarda platform
 *     sınırına takılabilir.
 *
 * Kullanıcı kimliği oturumdan geliyor, takım üyeliği DB'den doğrulanıyor.
 * Storage yazımı ve rapor kaydı service_role ile yapılıyor çünkü metin
 * çıkarımı + kuyruk açma sistem işi — ama HANGİ takım adına yazılacağı
 * oturumdan belirleniyor, istemciden gelen veriye güvenilmiyor.
 */

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
/** Bu eşiğin altında anlamlı bir değerlendirme yapılamaz. */
const MIN_TEXT_CHARS = 200;

/**
 * pdf.js hataları İngilizce ve teknik ("No password given", "Invalid PDF
 * structure."). Bunlar doğrudan kullanıcıya gösterildiğinde ne yapması
 * gerektiğini anlatmıyor. Bilinen durumları Türkçe ve eyleme dönük mesajla
 * karşılıyoruz; tanınmayanı olduğu gibi bırakıp bilgi kaybetmiyoruz.
 */
function pdfErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : '';
  if (/password/i.test(raw)) {
    return (
      'PDF şifre korumalı olduğu için açılamadı. Şifreyi kaldırıp yeniden ' +
      'yükleyin (Yazdır → PDF olarak kaydet ile şifresiz bir kopya üretebilirsiniz).'
    );
  }
  if (/size is zero|empty/i.test(raw)) {
    return 'Dosya boş (0 bayt). Yükleme sırasında bir sorun olmuş olabilir, tekrar deneyin.';
  }
  if (/invalid pdf|structure|corrupt|xref/i.test(raw)) {
    return (
      'Dosya geçerli bir PDF gibi görünmüyor veya bozuk. Uzantısı .pdf olan ' +
      'ama aslında PDF olmayan dosyalar da bu hatayı verir.'
    );
  }
  return `PDF okunamadı: ${raw || 'bilinmeyen hata'}`;
}

export async function POST(req: Request) {
  const db = supabaseAdmin();

  // Boyut kontrolü formData() AYRIŞTIRMASINDAN ÖNCE: büyük gövdede
  // formData() kendisi patlıyor ve kullanıcı "multipart bekleniyor" gibi
  // alakasız bir mesaj görüyordu. Content-Length ile önden kes.
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) {
    return NextResponse.json(
      { error: `Dosya çok büyük (${(declared / 1024 / 1024).toFixed(1)} MB). Sınır 20 MB.` },
      { status: 413 },
    );
  }

  // Yetki en başta: kimliği doğrulanmamış biri için 20 MB gövde ayrıştırmayalım.
  const resolved = await resolveUploaderTeam();
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const team = resolved.team;

  const contentType = req.headers.get('content-type') ?? '';
  let title: string;
  let categoryId: string;
  let bytes: Uint8Array;
  let filePath: string;
  /** Hata halinde Storage'daki nesneyi silmemiz gerekiyor mu? */
  let cleanupOnFailure = false;

  if (contentType.includes('application/json')) {
    // ── YOL 1: dosya zaten Storage'da ──
    const body = (await req.json().catch(() => null)) as {
      file_path?: unknown;
      title?: unknown;
      category_id?: unknown;
    } | null;
    if (!body) {
      return NextResponse.json({ error: 'Geçersiz JSON gövde' }, { status: 400 });
    }
    title = String(body.title ?? '').trim();
    categoryId = String(body.category_id ?? '').trim();
    filePath = String(body.file_path ?? '').trim();
    if (!title) return NextResponse.json({ error: 'title alanı zorunlu' }, { status: 400 });

    // İstemciden gelen yolu DOĞRULA: başka takımın klasörü okunamaz/yazılamaz.
    if (!pathBelongsToTeam(filePath, team.teamId)) {
      return NextResponse.json({ error: 'Geçersiz dosya yolu' }, { status: 403 });
    }

    const { data: blob, error: de } = await db.storage.from('reports').download(filePath);
    if (de || !blob) {
      return NextResponse.json(
        { error: 'Yüklenen dosya bulunamadı. Yüklemeyi tekrar deneyin.' },
        { status: 404 },
      );
    }
    // Nesne bizim isteğimizin ürünü — çıkarım başarısız olursa yörüngede kalmasın.
    cleanupOnFailure = true;
    if (blob.size > MAX_BYTES) {
      await db.storage.from('reports').remove([filePath]);
      return NextResponse.json(
        { error: `Dosya çok büyük (${(blob.size / 1024 / 1024).toFixed(1)} MB). Sınır 20 MB.` },
        { status: 413 },
      );
    }
    if (blob.size === 0) {
      await db.storage.from('reports').remove([filePath]);
      return NextResponse.json({ error: pdfErrorMessage(new Error('size is zero')) }, { status: 422 });
    }
    bytes = new Uint8Array(await blob.arrayBuffer());
  } else {
    // ── YOL 2: multipart (geriye dönük uyumluluk / testler) ──
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        {
          error:
            'Dosya okunamadı. 20 MB sınırını aşmadığından ve geçerli bir PDF ' +
            'seçtiğinizden emin olun.',
        },
        { status: 400 },
      );
    }

    const file = form.get('file');
    title = String(form.get('title') ?? '').trim();
    categoryId = String(form.get('category_id') ?? '').trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file alanı zorunlu' }, { status: 400 });
    }
    if (!title) return NextResponse.json({ error: 'title alanı zorunlu' }, { status: 400 });
    if (file.type && file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: `Yalnızca PDF kabul ediliyor (gelen: ${file.type})` },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Dosya 20 MB sınırını aşıyor' }, { status: 413 });
    }
    bytes = new Uint8Array(await file.arrayBuffer());
    filePath = ''; // çıkarımdan sonra yüklenecek
  }

  // ⚠️ pdf.js (unpdf'in altında) verdiğimiz ArrayBuffer'ı DETACH ediyor.
  // Storage'a yüklenecek kopyayı ayrıştırmadan ÖNCE al, yoksa
  // "Cannot perform ArrayBuffer.prototype.slice on a detached ArrayBuffer".
  const bytesForUpload = Uint8Array.from(bytes);

  const fail = async (payload: object, status: number) => {
    if (cleanupOnFailure && filePath) await db.storage.from('reports').remove([filePath]);
    return NextResponse.json(payload, { status });
  };

  // ── PDF metnini çıkar (§2: unpdf) ──
  let extracted: string;
  let pageCount: number;
  try {
    const pdf = await getDocumentProxy(bytes);
    pageCount = pdf.numPages;
    const { text } = await extractText(pdf, { mergePages: true });
    extracted = (Array.isArray(text) ? text.join('\n') : text).trim();
  } catch (e) {
    return fail({ error: pdfErrorMessage(e) }, 422);
  }

  // Metin çıkmadı → taranmış görüntü olabilir (OCR kapsam dışı, PLAN.md §8).
  // Metin çıktı ama kısa → farklı bir sorun; "taranmış" demek yanıltıcı olur.
  if (extracted.length < MIN_TEXT_CHARS) {
    const scanned = extracted.length < 40;
    return fail(
      {
        error: scanned
          ? 'PDF içinden metin çıkarılamadı. Taranmış (görüntü) PDF olabilir — ' +
            'metin katmanı içeren, dijital olarak oluşturulmuş bir PDF yükleyin.'
          : `PDF'ten yalnızca ${extracted.length} karakter metin çıktı; ` +
            `değerlendirme için en az ${MIN_TEXT_CHARS} karakter gerekiyor. ` +
            'Doğru dosyayı seçtiğinizden emin olun.',
        extracted_chars: extracted.length,
      },
      422,
    );
  }

  const wordCount = extracted.split(/\s+/).filter(Boolean).length;

  // ── Multipart yolunda dosya henüz Storage'da değil ──
  if (!filePath) {
    filePath = `${team.teamId}/${crypto.randomUUID()}.pdf`;
    const { error: se } = await db.storage
      .from('reports')
      .upload(filePath, bytesForUpload, { contentType: 'application/pdf', upsert: false });
    if (se) {
      return NextResponse.json({ error: `Storage yükleme hatası: ${se.message}` }, { status: 500 });
    }
    cleanupOnFailure = true;
  }

  // ── reports satırı ──
  const { data: report, error: re } = await db
    .from('reports')
    .insert({
      competition_id: team.competitionId,
      category_id: categoryId || null,
      team_id: team.teamId,
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
    return fail({ error: `Rapor kaydedilemedi: ${re.message}` }, 500);
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
    actor: team.userId,
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
