import { NextResponse } from 'next/server';
import { extractTemplateSpec } from '@/lib/ai/extract-template';
import { extractPdfText, pdfErrorMessage } from '@/lib/reports/pdf';
import {
  TEMPLATE_MAX_BYTES,
  TEMPLATE_MIN_TEXT_CHARS,
  UUID_RE,
  templatePathBelongsTo,
} from '@/lib/reports/template';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/supabase/server';

/**
 * POST /api/competitions/[id]/template — şablon PDF'ini template_spec'e çevirir.
 *
 * Gövde: { file_path } — dosya imzalı URL ile zaten Storage'a yüklenmiş.
 *
 * Akış: PDF → metin → Gemini (yapılandırılmış çıktı) → alıntı doğrulama →
 *       competitions.template_spec.
 *
 * Bu, elle template_spec doldurmanın yerini alıyor. Kaydedilen spec'in şekli
 * scripts/seed.ts'teki elle yazılmış TEMPLATE_SPEC ile birebir aynı, çünkü
 * aynı alanı okuyan ekranlar ve buildCompetitionContext var.
 *
 * ÖNEMLİ: yeni spec kaydedilirken ESKİSİ `template_spec.previous` altında
 * saklanıyor. Model yanlış çıkarım yaparsa yönetici geri dönebilsin diye —
 * yarışma kuralları tek bir model çağrısına emanet edilemez.
 */
export async function POST(req: Request, ctx: RouteContext<'/api/competitions/[id]/template'>) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Geçersiz yarışma kimliği.' }, { status: 400 });
  }
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { file_path?: unknown } | null;
  const filePath = String(body?.file_path ?? '').trim();
  if (!templatePathBelongsTo(filePath, id)) {
    return NextResponse.json({ error: 'Geçersiz dosya yolu.' }, { status: 403 });
  }

  const db = supabaseAdmin();
  const cleanup = () => db.storage.from('reports').remove([filePath]);

  const { data: blob, error: de } = await db.storage.from('reports').download(filePath);
  if (de || !blob) {
    return NextResponse.json(
      { error: 'Yüklenen şablon bulunamadı. Yüklemeyi tekrar deneyin.' },
      { status: 404 },
    );
  }
  if (blob.size > TEMPLATE_MAX_BYTES) {
    await cleanup();
    return NextResponse.json(
      { error: `Şablon çok büyük (${(blob.size / 1024 / 1024).toFixed(1)} MB). Sınır 10 MB.` },
      { status: 413 },
    );
  }

  let text: string;
  let pageCount: number;
  try {
    const out = await extractPdfText(new Uint8Array(await blob.arrayBuffer()));
    text = out.text;
    pageCount = out.pageCount;
  } catch (e) {
    await cleanup();
    return NextResponse.json({ error: pdfErrorMessage(e) }, { status: 422 });
  }

  if (text.length < TEMPLATE_MIN_TEXT_CHARS) {
    await cleanup();
    return NextResponse.json(
      {
        error:
          text.length < 40
            ? 'Şablon PDF\'inden metin çıkarılamadı. Taranmış (görüntü) PDF olabilir — ' +
              'metin katmanı içeren bir dosya yükleyin.'
            : `Şablondan yalnızca ${text.length} karakter metin çıktı; ` +
              `çıkarım için en az ${TEMPLATE_MIN_TEXT_CHARS} karakter gerekiyor.`,
      },
      { status: 422 },
    );
  }

  let extraction: Awaited<ReturnType<typeof extractTemplateSpec>>;
  try {
    extraction = await extractTemplateSpec(text);
  } catch (e) {
    // Dosyayı BIRAKMIYORUZ ama silmiyoruz da: kota hatasında yönetici
    // "tekrar dene"ye basınca aynı dosyayı yeniden yüklemek zorunda kalmasın.
    return NextResponse.json(
      { error: `Şablon çözümlenemedi: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`, file_path: filePath },
      { status: 502 },
    );
  }

  // Eski spec'i sakla — yanlış çıkarımdan dönülebilsin.
  const { data: existing } = await db
    .from('competitions')
    .select('template_spec')
    .eq('id', id)
    .maybeSingle();
  const previous = (existing?.template_spec ?? null) as Record<string, unknown> | null;
  if (previous) delete previous.previous; // tek kademe geçmiş yeter, sonsuz iç içe olmasın

  const spec = {
    ...extraction.spec,
    source: {
      file_path: filePath,
      page_count: pageCount,
      extracted_chars: text.length,
      model: extraction.model,
      prompt_version: 'v1',
      extracted_at: new Date().toISOString(),
      /** Alıntıların kaçı şablon metninde birebir bulundu? */
      quotes_verified: extraction.quotes.filter((q) => q.verified).length,
      quotes_total: extraction.quotes.length,
    },
    previous,
  };

  const { error: ue } = await db.from('competitions').update({ template_spec: spec }).eq('id', id);
  if (ue) {
    return NextResponse.json({ error: `Şablon kaydedilemedi: ${ue.message}` }, { status: 500 });
  }

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'competition.template_extracted',
    entity: 'competitions',
    entity_id: id,
    meta: {
      file_path: filePath,
      model: extraction.model,
      mocked: extraction.mocked,
      sections: extraction.spec.required_sections.length,
      not_specified: extraction.spec.not_specified,
      quotes_verified: spec.source.quotes_verified,
      quotes_total: spec.source.quotes_total,
    },
  });

  return NextResponse.json({
    spec: extraction.spec,
    model: extraction.model,
    mocked: extraction.mocked,
    page_count: pageCount,
    extracted_chars: text.length,
    quotes: extraction.quotes,
    usage: extraction.usage,
  });
}
