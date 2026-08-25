import { supabaseAdmin } from '@/lib/supabase/admin';
import { callModelForCheck } from './call-claude-for-check';
import { CHECK_INSTRUCTIONS, buildCompetitionContext } from './prompts';
import { SCHEMAS, type CriteriaScoringPayload } from './schemas';
import { deriveVerdict, processCriteriaScoring } from './evidence';
import { measureFormat, type FormatFinding } from '@/lib/reports/format-check';
import { extractPdfText } from '@/lib/reports/pdf';
import {
  INLINE_PDF_MAX_BYTES,
  MULTIMODAL_CHECKS,
  MULTIMODAL_PDF,
  SIMILARITY_MIN_LEXICAL,
  type CheckType,
} from './config';

/**
 * Raporun PDF'ini Storage'dan indirir — çok-modlu analiz için.
 *
 * null dönerse metin-only devam edilir. Sessiz değil: neden PDF gönderilmediği
 * loglanır, çünkü "biçim kuralları kontrol edilemedi" sonucunun sebebi
 * denetlenebilir olmalı.
 */
async function loadPdfBytes(
  db: ReturnType<typeof supabaseAdmin>,
  filePath: string | null,
  label: string,
): Promise<Uint8Array | null> {
  if (!MULTIMODAL_PDF) return null;
  if (!filePath) {
    console.warn(`[zema:ai] ${label}: file_path boş — metin-only analiz.`);
    return null;
  }
  const { data, error } = await db.storage.from('reports').download(filePath);
  if (error || !data) {
    console.warn(`[zema:ai] ${label}: PDF indirilemedi (${error?.message ?? 'yok'}) — metin-only analiz.`);
    return null;
  }
  if (data.size > INLINE_PDF_MAX_BYTES) {
    console.warn(
      `[zema:ai] ${label}: PDF ${(data.size / 1048576).toFixed(1)} MB, ` +
        `satır içi sınır ${(INLINE_PDF_MAX_BYTES / 1048576).toFixed(0)} MB — metin-only analiz.`,
    );
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Tek bir analiz işini çalıştırır ve analysis_results'a yazar.
 * Job runner (/api/jobs/tick) bunu her kapılan iş için çağırır.
 */

export type RunOutcome =
  | { kind: 'done'; verdict: string; mocked: boolean }
  /** Bağımlılığı henüz hazır değil — iş pending'e geri konur, deneme sayılmaz. */
  | { kind: 'deferred'; reason: string };

export async function runCheck(reportId: string, checkType: CheckType): Promise<RunOutcome> {
  const db = supabaseAdmin();

  // ── Rapor + yarışma bağlamı ──
  const { data: report, error: re } = await db
    .from('reports')
    .select('id, title, extracted_text, file_path, category_id, competition_id, stage_id')
    .eq('id', reportId)
    .single();
  if (re || !report) throw new Error(`rapor okunamadı: ${re?.message ?? 'bulunamadı'}`);
  if (!report.extracted_text) throw new Error('raporun extracted_text alanı boş');

  // ŞABLON VE RUBRİK AŞAMADAN GELİYOR (0010). Yarışma düzeyindeki
  // template_spec artık yalnızca geriye dönük uyumluluk için duruyor;
  // analiz raporun ait olduğu AŞAMANIN kurallarına göre yapılmalı —
  // ÖTR ile KTR aynı şablona göre değerlendirilemez.
  const [{ data: competition }, { data: stage }, { data: categories }, { data: criteria }] =
    await Promise.all([
    db
      .from('competitions')
      .select('name, year, language')
      .eq('id', report.competition_id)
      .single(),
    db
      .from('report_stages')
      .select('id, name, template_spec, submission_deadline')
      .eq('id', report.stage_id)
      .single(),
    db
      .from('categories')
      .select('id, name, description')
      .eq('competition_id', report.competition_id)
      .order('name'),
    db
      .from('criteria')
      .select('id, name, description, max_score, weight')
      // Kriterler de aşamaya bağlı: her teslimin kendi rubriği var.
      .eq('stage_id', report.stage_id)
      .order('sort_order'),
  ]);
  if (!competition) throw new Error('yarışma bulunamadı');
  if (!stage) throw new Error('raporun aşaması bulunamadı');

  const competitionContext = buildCompetitionContext({
    competition: { ...competition, template_spec: stage.template_spec },
    stageName: stage.name,
    categories: categories ?? [],
    criteria: criteria ?? [],
  });

  // ── Kontrole özel ek girdi ──
  let instruction = CHECK_INSTRUCTIONS[checkType];
  let pairContext: { candidateId: string; lexical: number } | null = null;
  let otherFilePath: string | null = null;

  if (checkType === 'category_fit') {
    const declared = (categories ?? []).find((c) => c.id === report.category_id);
    // Şema artık kategori UUID'si taşımıyor; modele yalnızca ADI veriliyor.
    instruction +=
      '\n\nBEYAN EDİLEN KATEGORİ: ' +
      (declared ? `"${declared.name}"` : '(yarışmacı kategori beyan etmemiş)');
  }

  if (checkType === 'similarity') {
    // §4.4 aşama 1: adayları Postgres seçer, model yalnızca en yakınını görür.
    const { data: candidates, error: ce } = await db.rpc('similarity_candidates', {
      p_report_id: reportId,
      p_limit: 5,
    });
    if (ce) throw new Error(`aday eleme hatası: ${ce.message}`);

    // SQL tabanı bilinçli olarak gevşek; asıl eşik burada uygulanıyor ki
    // tek yerden ayarlanabilsin (bkz. SIMILARITY_MIN_LEXICAL).
    const list = (
      (candidates ?? []) as Array<{ candidate_id: string; lexical_score: number }>
    ).filter((c) => Number(c.lexical_score) >= SIMILARITY_MIN_LEXICAL);

    if (list.length === 0) {
      // Karşılaştıracak rapor yok → model çağrısı YAPMA, kota harcama.
      // Bu bir "kanıt yok" durumu değil; gerçekten örtüşme yok.
      return writeResult(reportId, checkType, {
        payload: {
          semantic_score: 0,
          overlap_type: 'none',
          matched_passages: [],
          matched_visuals: [],
          assessment:
            'Aynı yarışma ve kategoride, ön eleme eşiğini (%' +
            Math.round(SIMILARITY_MIN_LEXICAL * 100) +
            ' sözcük örtüşmesi) geçen bir rapor bulunmadı. Ortak şablon ve ' +
            'terminoloji kaynaklı benzerlikler bu eşiğin altında kalır.',
        },
        model: 'skipped:no-candidates',
        promptVersion: 'v1',
        usage: null,
        mocked: false,
      });
    }

    const { data: other } = await db
      .from('reports')
      .select('title, extracted_text, file_path')
      .eq('id', list[0].candidate_id)
      .single();
    otherFilePath = other?.file_path ?? null;
    instruction +=
      `\n\nKARŞILAŞTIRILACAK RAPOR (başlık: ${other?.title ?? '-'}):\n` +
      `<karsilastirilan_rapor>\n${other?.extracted_text ?? ''}\n</karsilastirilan_rapor>`;

    // Sonucu yazdıktan sonra similarity_pairs satırını da aç — §4.4'e göre
    // hakem HER eşleşmeyi bağımsız değerlendiriyor ve kararını oraya yazıyor.
    pairContext = { candidateId: list[0].candidate_id, lexical: list[0].lexical_score };
  }

  if (checkType === 'feedback_synthesis') {
    // §4.6: 1–5 arası kontrollerin sonuçlarını girdi alır → onlar bitmeden çalışamaz.
    const { data: prior } = await db
      .from('analysis_results')
      .select('check_type, verdict, payload')
      .eq('report_id', reportId)
      .neq('check_type', 'feedback_synthesis');

    const done = new Set((prior ?? []).map((r) => r.check_type));
    const needed: CheckType[] = [
      'required_sections',
      'template_compliance',
      'language_check',
      'title_content',
      'category_fit',
      'similarity',
      'criteria_scoring',
    ];
    const missing = needed.filter((c) => !done.has(c));
    if (missing.length > 0) {
      return { kind: 'deferred', reason: `önce şunlar bitmeli: ${missing.join(', ')}` };
    }

    instruction +=
      '\n\nDİĞER KONTROLLERİN SONUÇLARI:\n' +
      JSON.stringify(prior, null, 2);
  }

  // ── Çok-modlu girdi: PDF'in kendisi ──
  // Tablolar, şemalar ve BİÇİM KURALLARI (yazı tipi, sayfa sınırı, altbilgi)
  // düz metinden görülemiyor. Ayrı bir OCR/tablo hattı kurmak yerine PDF
  // doğrudan modele veriliyor. Metin de gönderilmeye devam ediyor —
  // kanıt doğrulaması alıntıları extracted_text içinde arıyor.
  const pdfs: Array<{ label: string; bytes: Uint8Array }> = [];
  if (MULTIMODAL_CHECKS.has(checkType)) {
    const own = await loadPdfBytes(db, report.file_path, `${checkType}/rapor`);
    if (own) pdfs.push({ label: 'rapor', bytes: own });
    if (checkType === 'similarity' && otherFilePath) {
      const otherPdf = await loadPdfBytes(db, otherFilePath, `${checkType}/karsilastirilan`);
      // Tablo/görsel karşılaştırması İKİ PDF gerektirir; biri eksikse
      // görsel örtüşme aranmaz ama metin karşılaştırması yine yapılır.
      if (otherPdf) pdfs.push({ label: 'karsilastirilan_rapor', bytes: otherPdf });
      else if (own) pdfs.length = 0;
    }
  }

  // ── ŞABLON METNİ: template_compliance'a referans olarak ver ──
  // required_sections yalnızca BAŞLIK ADLARINI taşıyor — şablon PDF'inin
  // her başlık altında "burada şunlar yazılmalı" diye verdiği ayrıntılı
  // talimat, çıkarım sırasında bir başlık listesine indirgenirken kaybolur.
  // Bu kontrol raporu şablona göre değerlendirebilsin diye şablonun kendi
  // metni (varsa) yeniden okunup talimata ekleniyor — ayrı bir yapılandırılmış
  // alan TUTMUYORUZ, çünkü kaynak zaten PDF'in kendisi ve o değişebilir
  // (şablon yeniden yüklenebilir); ikinci bir kopyayı senkron tutmak yerine
  // her seferinde taze okunuyor.
  if (checkType === 'template_compliance') {
    const spec = stage.template_spec as {
      source?: { file_path?: string };
      sources?: { sablon?: { file_path?: string } };
    };
    const templatePath = spec.sources?.sablon?.file_path ?? spec.source?.file_path ?? null;
    if (templatePath) {
      const { data: blob } = await db.storage.from('reports').download(templatePath);
      if (blob) {
        try {
          const { text: templateText } = await extractPdfText(new Uint8Array(await blob.arrayBuffer()));
          instruction +=
            '\n\nŞABLON METNİ (referans — her zorunlu başlığın altında bunu karşılayıp ' +
            'karşılamadığını değerlendir):\n<sablon_metni>\n' +
            templateText +
            '\n</sablon_metni>';
        } catch (e) {
          console.warn(`[zema:ai] şablon metni okunamadı: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }

  // ── BİÇİM KURALLARI: ölç, sorma ──
  // Model çok-modlu denemede iki tarafa yaslı bir belgeyi "sola hizalı"
  // diye raporladı. Yazı tipi/hizalama piksel ölçümü isteyen özellikler;
  // yanlış bir "kurala uymuyor" bulgusu yarışmacıyı haksız cezalandırır.
  // Ölçüm MOCK_AI'dan BAĞIMSIZ — mock modda bile bu bulgular gerçek.
  let formatFindings: FormatFinding[] = [];
  if (checkType === 'template_compliance') {
    const spec = (stage.template_spec ?? {}) as { format?: Record<string, unknown> };
    const fmt = spec.format ?? {};
    const own = pdfs.find((f) => f.label === 'rapor');
    if (own && Object.keys(fmt).length > 0) {
      try {
        formatFindings = await measureFormat(Uint8Array.from(own.bytes), {
          font: typeof fmt.font === 'string' ? fmt.font : undefined,
          page: typeof fmt.page === 'string' ? fmt.page : undefined,
          alignment: typeof fmt.alignment === 'string' ? fmt.alignment : undefined,
          max_pages: typeof fmt.max_pages === 'number' ? fmt.max_pages : undefined,
          footer: typeof fmt.footer === 'string' ? fmt.footer : undefined,
        });
      } catch (e) {
        // Ölçüm başarısız olursa kontrolün tamamı düşmesin — biçim bulgusu
        // olmadan devam edilir, "uygun" DENMEZ.
        console.warn(`[zema:ai] biçim ölçümü başarısız: ${e instanceof Error ? e.message : e}`);
      }
    }
    if (formatFindings.length > 0) {
      instruction +=
        '\n\nÖLÇÜLEN BİÇİM BULGULARI (PDF\'ten doğrudan ölçüldü, yeniden değerlendirme):\n' +
        formatFindings
          .map((f) => `- ${f.rule}: ${f.status.toUpperCase()} — ${f.evidence}`)
          .join('\n');
    }
  }

  // ── Model çağrısı ──
  const result = await callModelForCheck({
    checkType,
    competitionContext,
    reportText: report.extracted_text,
    instruction,
    schema: SCHEMAS[checkType],
    pdfs,
  });

  // Ölçülen biçim bulgularını payload'a EKLE — modelin çıktısı değil,
  // ölçüm. UI bunları "PDF'ten ölçüldü" etiketiyle gösteriyor.
  const enriched =
    formatFindings.length > 0
      ? { ...result, payload: { ...(result.payload as object), format_checks: formatFindings } }
      : result;

  const outcome = await writeResult(reportId, checkType, enriched);

  if (checkType === 'similarity' && pairContext) {
    const p = result.payload as unknown as {
      semantic_score: number;
      matched_passages: unknown[];
      matched_visuals: Array<{ kind: 'tablo' | 'gorsel'; a_page: number; b_page: number; what: string; note: string }>;
      assessment?: string;
    };
    const assessment = p.assessment ?? '';

    // similarity_pairs'in unique kısıtı (report_id, other_report_id,
    // content_type) — şema en başından içerik türü başına AYRI satır
    // öngörüyordu ama yalnızca 'metin' yazılıyordu. Artık tablo ve görsel
    // örtüşmeleri kendi satırlarına gidiyor: hakem "metinde temiz ama
    // bütçe tablosu aynı" durumunu ayrı ayrı karara bağlayabiliyor.
    type PairRow = {
      report_id: string;
      other_report_id: string;
      content_type: 'metin' | 'tablo' | 'gorsel';
      lexical_score: number | null;
      semantic_score: number;
      evidence: Record<string, unknown>;
    };
    const rows: PairRow[] = [
      {
        report_id: reportId,
        other_report_id: pairContext.candidateId,
        content_type: 'metin',
        lexical_score: pairContext.lexical,
        semantic_score: p.semantic_score,
        evidence: { matched_passages: p.matched_passages, assessment },
      },
    ];

    for (const kind of ['tablo', 'gorsel'] as const) {
      const hits = (p.matched_visuals ?? []).filter((v) => v.kind === kind);
      if (hits.length === 0) continue;
      rows.push({
        report_id: reportId,
        other_report_id: pairContext.candidateId,
        content_type: kind,
        // Görsel örtüşmenin sözcüksel (trigram) karşılığı yok — uydurmuyoruz.
        lexical_score: null,
        semantic_score: p.semantic_score,
        evidence: { matched_visuals: hits, assessment },
      });
    }

    await db
      .from('similarity_pairs')
      .upsert(rows, { onConflict: 'report_id,other_report_id,content_type' });
  }

  return outcome;
}

type ModelResult = {
  payload: unknown;
  model: string;
  promptVersion: string;
  usage: unknown;
  mocked: boolean;
};

/** Sonucu analysis_results'a yazar; criteria_scoring için kanıt doğrulaması uygular. */
async function writeResult(
  reportId: string,
  checkType: CheckType,
  result: ModelResult,
): Promise<RunOutcome> {
  const db = supabaseAdmin();
  let payload = result.payload;
  let verdict: string;
  let score: number | null = null;

  if (checkType === 'criteria_scoring') {
    const { data: report } = await db
      .from('reports')
      .select('extracted_text')
      .eq('id', reportId)
      .single();

    // §4.5 halüsinasyon kalkanı — alıntıları rapora karşı doğrula.
    const processed = processCriteriaScoring(
      report?.extracted_text ?? '',
      payload as CriteriaScoringPayload,
    );
    verdict = processed.verdict;
    payload = {
      ...(payload as object),
      criteria: processed.criteria,
      evidence_stats: processed.evidenceStats,
    };

    // ai_criterion_scores tablosunu da doldur (§4.5 hakem ekranının kaynağı)
    const rows = processed.criteria.map((c) => ({
      report_id: reportId,
      criterion_id: c.criterion_id,
      score: c.score,
      confidence: c.confidence,
      status: c.status,
      ai_text: c.ai_text,
      evidence: c.evidence_quotes,
      edit_status: 'ai_generated' as const,
    }));
    if (rows.length) {
      const { error } = await db
        .from('ai_criterion_scores')
        .upsert(rows, { onConflict: 'report_id,criterion_id' });
      // Kriter UUID'si uydurulmuşsa FK patlar — sonucu yine kaydet, hatayı yükselt.
      if (error) throw new Error(`ai_criterion_scores yazılamadı: ${error.message}`);
    }

    const total = processed.criteria.reduce((a, c) => a + c.score, 0);
    score = processed.criteria.length ? Math.round((total / processed.criteria.length) * 10) : null;
  } else {
    // category_fit'in conflicting_quote'u rapor metnine karşı doğrulanıyor;
    // diğer kontroller reportText'i kullanmıyor ama geçmek zararsız.
    const { data: forQuote } =
      checkType === 'category_fit'
        ? await db.from('reports').select('extracted_text').eq('id', reportId).single()
        : { data: null };
    verdict = deriveVerdict(checkType, payload, undefined, forQuote?.extracted_text ?? undefined);
    const p = payload as Record<string, unknown>;
    if (typeof p.compliance_score === 'number') score = p.compliance_score;
    else if (typeof p.alignment_score === 'number') score = p.alignment_score;
    else if (typeof p.semantic_score === 'number') score = p.semantic_score;
  }

  // §4.6: geri bildirim sentezi ayrıca `feedback` tablosuna is_published=false
  // olarak yazılır — Değerlendirme Yöneticisi okur, düzenler, yayımlar.
  // Yarışmacı ekranının TEK kaynağı bu tablo (§3.1).
  if (checkType === 'feedback_synthesis') {
    const { data: existing } = await db
      .from('feedback')
      .select('id, is_published')
      .eq('report_id', reportId)
      .maybeSingle();
    // Yayımlanmış bir geri bildirimi yeniden analiz EZMEMELİ.
    if (!existing?.is_published) {
      const row = { report_id: reportId, content: payload as object, is_published: false };
      if (existing) await db.from('feedback').update(row).eq('id', existing.id);
      else await db.from('feedback').insert(row);
    }
  }

  /**
   * KORUMA: mock sonuç, GERÇEK bir sonucun üstüne YAZILMAZ.
   *
   * Yaşanmış olay: demo verisi hazırken MOCK_AI=true ile tick çalıştırıldı ve
   * referans raporun beş gerçek sonucu fixture ile ezildi. Demo günü aynı şey
   * olursa jüri yer tutucu metin görür. Bu yüzden mock yazımı, mevcut sonuç
   * gerçek bir modelden geliyorsa sessizce atlanır.
   */
  if (result.mocked) {
    const { data: existing } = await db
      .from('analysis_results')
      .select('model')
      .eq('report_id', reportId)
      .eq('check_type', checkType)
      .maybeSingle();
    if (existing && !existing.model.startsWith('mock:')) {
      return {
        kind: 'done',
        verdict: verdict ?? 'pass',
        mocked: true,
      };
    }
  }

  const { error } = await db.from('analysis_results').upsert(
    {
      report_id: reportId,
      check_type: checkType,
      score,
      verdict,
      payload,
      model: result.model,
      prompt_version: result.promptVersion,
      usage: result.usage,
      /**
       * created_at AÇIKÇA yazılıyor.
       *
       * Kolonun `default now()` değeri yalnızca INSERT'te işliyor; bu bir
       * UPSERT ve satır güncellendiğinde zaman damgası ESKİ kalıyordu.
       * Sahada görüldü: R-798F26'nın title_content kontrolü yeniden
       * çalıştırıldı, verdict warn→fail ve payload tamamen değişti ama
       * created_at 19 saat önceki değerde kaldı. Satırın tamamı (payload,
       * verdict, model, usage) değiştiği için zaman damgası da sonucun
       * GERÇEKTEN üretildiği anı göstermeli — aksi halde "her AI çıktısı
       * için model ve zaman loglanır" denetlenebilirlik iddiası çürük olur.
       */
      created_at: new Date().toISOString(),
    },
    { onConflict: 'report_id,check_type' },
  );
  if (error) throw new Error(`analysis_results yazılamadı: ${error.message}`);

  return { kind: 'done', verdict, mocked: result.mocked };
}
