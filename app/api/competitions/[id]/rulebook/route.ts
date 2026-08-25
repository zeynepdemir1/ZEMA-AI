import { NextResponse } from 'next/server';
import { extractRulebookSpec, RULEBOOK_PROMPT_VERSION } from '@/lib/ai/extract-rulebook';
import { replaceCriteria } from '@/lib/reports/criteria-writer';
import { extractPdfText, pdfErrorMessage } from '@/lib/reports/pdf';
import { withSource } from '@/lib/reports/spec-sources';
import { resolveStage } from '@/lib/reports/stage-resolve';
import {
  TEMPLATE_MAX_BYTES,
  TEMPLATE_MIN_TEXT_CHARS,
  UUID_RE,
  rulebookPathBelongsTo,
} from '@/lib/reports/template';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/supabase/server';

/**
 * POST /api/competitions/[id]/rulebook — şartnameden RUBRİK çıkarır.
 *
 * Gövde: { file_path, stage_id? } — dosya imzalı URL ile zaten Storage'a
 * yüklenmiş. `stage_id` verilmezse yarışmanın ilk aşaması kullanılır.
 *
 * NEDEN AYRI BİR AKIŞ: puanlama rubriği çoğu TEKNOFEST yarışmasında rapor
 * ŞABLONUNDA değil ŞARTNAMEDE. Sahada ölçüldü — gerçek bir ÖTR şablonundan
 * ve bir Model Uydu PDR şablonundan çıkarılan kriter sayısı ikisinde de 0.
 * Şablon "raporu nasıl yazacaksın"ı, şartname "nasıl puanlanacaksın"ı
 * anlatıyor. Bu rota o boşluğu kapatıyor.
 *
 * BİRLEŞTİRME: şablon `format` + `required_sections` getiriyor, şartname
 * `criteria` + `extra_rules`. İkisi `template_spec` üzerinde birleşiyor ve
 * hangi alanın hangi belgeden geldiği `sources.<tür>.fields` altında
 * işaretleniyor — "bu kural hangi PDF'ten geldi" sorusu bir daha
 * cevaplanamaz kalmasın.
 */
export async function POST(req: Request, ctx: RouteContext<'/api/competitions/[id]/rulebook'>) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Geçersiz yarışma kimliği.' }, { status: 400 });
  }
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    file_path?: unknown;
    stage_id?: unknown;
  } | null;
  const filePath = String(body?.file_path ?? '').trim();
  if (!rulebookPathBelongsTo(filePath, id)) {
    return NextResponse.json({ error: 'Geçersiz dosya yolu.' }, { status: 403 });
  }

  const db = supabaseAdmin();

  // ŞARTNAME DE AŞAMAYA YAZILIYOR (0010) — template/route.ts ile aynı gerekçe.
  const stage = await resolveStage(db, id, body?.stage_id);
  if (!stage) {
    return NextResponse.json(
      { error: 'Bu yarışmada rapor aşaması bulunamadı.' },
      { status: 404 },
    );
  }

  const cleanup = () => db.storage.from('reports').remove([filePath]);

  const { data: blob, error: de } = await db.storage.from('reports').download(filePath);
  if (de || !blob) {
    return NextResponse.json(
      { error: 'Yüklenen şartname bulunamadı. Yüklemeyi tekrar deneyin.' },
      { status: 404 },
    );
  }
  if (blob.size > TEMPLATE_MAX_BYTES) {
    await cleanup();
    return NextResponse.json(
      { error: `Şartname çok büyük (${(blob.size / 1024 / 1024).toFixed(1)} MB). Sınır 10 MB.` },
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
            ? 'Şartname PDF\'inden metin çıkarılamadı. Taranmış (görüntü) PDF olabilir — ' +
              'metin katmanı içeren bir dosya yükleyin.'
            : `Şartnameden yalnızca ${text.length} karakter metin çıktı; ` +
              `çıkarım için en az ${TEMPLATE_MIN_TEXT_CHARS} karakter gerekiyor.`,
      },
      { status: 422 },
    );
  }

  let extraction: Awaited<ReturnType<typeof extractRulebookSpec>>;
  try {
    extraction = await extractRulebookSpec(text);
  } catch (e) {
    // Dosyayı silmiyoruz: kota hatasında yönetici "tekrar dene"ye basınca
    // aynı PDF'i yeniden yüklemek zorunda kalmasın.
    return NextResponse.json(
      {
        error: `Şartname çözümlenemedi: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`,
        file_path: filePath,
      },
      { status: 502 },
    );
  }

  const spec = extraction.spec;

  // ── Rubriği criteria tablosuna yaz ──
  // Rubrik BULUNAMADIYSA mevcut kriterlere DOKUNMA: olmayan bir rubriği
  // "boş" diye üzerine yazmak, elle girilmiş kriterleri silmek olurdu.
  let criteriaResult: { replaced: number; note?: string } = { replaced: 0 };
  if (spec.criteria.length > 0) {
    criteriaResult = await replaceCriteria(db, id, spec.criteria, stage.id);
  }

  // ── template_spec'i birleştir — AŞAMANIN spec'i (0010) ──
  const current = { ...stage.template_spec } as Record<string, unknown>;
  const previous = { ...current };
  delete previous.previous; // tek kademe geçmiş yeter

  const fields: string[] = [];
  if (spec.criteria.length) fields.push('criteria');
  if (spec.extra_rules.length) fields.push('content_rules');

  // Şartnamenin ek kuralları content_rules'a EKLENİYOR, üzerine yazılmıyor:
  // şablonun içerik kuralları da geçerli kalmalı. Tekrarlar ayıklanıyor.
  const mergedRules = [
    ...((current.content_rules as string[] | undefined) ?? []),
    ...spec.extra_rules,
  ].filter((r, i, a) => r.trim() && a.indexOf(r) === i);

  const merged = withSource(
    {
      ...current,
      content_rules: mergedRules,
      previous,
    },
    {
      kind: 'sartname',
      file_path: filePath,
      model: extraction.model,
      prompt_version: RULEBOOK_PROMPT_VERSION,
      extracted_at: new Date().toISOString(),
      page_count: pageCount,
      extracted_chars: text.length,
      quotes_verified: extraction.quotes.filter((q) => q.verified).length,
      quotes_total: extraction.quotes.length,
      fields,
      declares: spec.competition_name,
    },
  );

  const { error: ue } = await db
    .from('report_stages')
    .update({ template_spec: merged })
    .eq('id', stage.id);
  if (ue) {
    return NextResponse.json({ error: `Şartname kaydedilemedi: ${ue.message}` }, { status: 500 });
  }

  const { count: criteriaCount } = await db
    .from('criteria')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', stage.id);

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'stage.rulebook_extracted',
    entity: 'report_stages',
    entity_id: stage.id,
    meta: {
      file_path: filePath,
      model: extraction.model,
      mocked: extraction.mocked,
      declares: spec.competition_name,
      criteria_found: spec.criteria.length,
      criteria_written: criteriaResult.replaced,
      extra_rules: spec.extra_rules.length,
      not_specified: spec.not_specified,
      quotes_verified: extraction.quotes.filter((q) => q.verified).length,
      quotes_total: extraction.quotes.length,
    },
  });

  return NextResponse.json({
    spec,
    model: extraction.model,
    mocked: extraction.mocked,
    page_count: pageCount,
    extracted_chars: text.length,
    quotes: extraction.quotes,
    usage: extraction.usage,
    criteria: { ...criteriaResult, existing: criteriaCount ?? 0 },
  });
}
