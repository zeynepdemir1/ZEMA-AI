import { supabaseAdmin } from '@/lib/supabase/admin';
import { callModelForCheck } from './call-claude-for-check';
import { CHECK_INSTRUCTIONS, buildCompetitionContext } from './prompts';
import { SCHEMAS, type CriteriaScoringPayload } from './schemas';
import { deriveVerdict, processCriteriaScoring } from './evidence';
import type { CheckType } from './config';

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
    .select('id, title, extracted_text, category_id, competition_id')
    .eq('id', reportId)
    .single();
  if (re || !report) throw new Error(`rapor okunamadı: ${re?.message ?? 'bulunamadı'}`);
  if (!report.extracted_text) throw new Error('raporun extracted_text alanı boş');

  const [{ data: competition }, { data: categories }, { data: criteria }] = await Promise.all([
    db
      .from('competitions')
      .select('name, year, language, template_spec')
      .eq('id', report.competition_id)
      .single(),
    db
      .from('categories')
      .select('id, name, description')
      .eq('competition_id', report.competition_id)
      .order('name'),
    db
      .from('criteria')
      .select('id, name, description, max_score, weight')
      .eq('competition_id', report.competition_id)
      .order('sort_order'),
  ]);
  if (!competition) throw new Error('yarışma bulunamadı');

  const competitionContext = buildCompetitionContext({
    competition,
    categories: categories ?? [],
    criteria: criteria ?? [],
  });

  // ── Kontrole özel ek girdi ──
  let instruction = CHECK_INSTRUCTIONS[checkType];

  if (checkType === 'category_fit') {
    const declared = (categories ?? []).find((c) => c.id === report.category_id);
    instruction +=
      '\n\nBEYAN EDİLEN KATEGORİ: ' +
      (declared ? `[${declared.id}] ${declared.name}` : '(yarışmacı kategori beyan etmemiş)');
  }

  if (checkType === 'similarity') {
    // §4.4 aşama 1: adayları Postgres seçer, model yalnızca en yakınını görür.
    const { data: candidates, error: ce } = await db.rpc('similarity_candidates', {
      p_report_id: reportId,
      p_limit: 5,
    });
    if (ce) throw new Error(`aday eleme hatası: ${ce.message}`);

    const list = (candidates ?? []) as Array<{ candidate_id: string; lexical_score: number }>;
    if (list.length === 0) {
      // Karşılaştıracak rapor yok → model çağrısı YAPMA, kota harcama.
      // Bu bir "kanıt yok" durumu değil; gerçekten örtüşme yok.
      return writeResult(reportId, checkType, {
        payload: {
          content_type: 'metin',
          semantic_score: 0,
          overlap_type: 'none',
          matched_passages: [],
          assessment:
            'Aynı yarışma ve kategoride karşılaştırılacak başka rapor bulunmadığı için ' +
            'benzerlik taraması yapılmadı.',
        },
        model: 'skipped:no-candidates',
        promptVersion: 'v1',
        usage: null,
        mocked: false,
      });
    }

    const { data: other } = await db
      .from('reports')
      .select('title, extracted_text')
      .eq('id', list[0].candidate_id)
      .single();
    instruction +=
      `\n\nKARŞILAŞTIRILACAK RAPOR (başlık: ${other?.title ?? '-'}):\n` +
      `<karsilastirilan_rapor>\n${other?.extracted_text ?? ''}\n</karsilastirilan_rapor>`;
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
      'language_template',
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

  // ── Model çağrısı ──
  const result = await callModelForCheck({
    checkType,
    competitionContext,
    reportText: report.extracted_text,
    instruction,
    schema: SCHEMAS[checkType],
  });

  return writeResult(reportId, checkType, result);
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
    verdict = deriveVerdict(checkType, payload);
    const p = payload as Record<string, unknown>;
    if (typeof p.compliance_score === 'number') score = p.compliance_score;
    else if (typeof p.alignment_score === 'number') score = p.alignment_score;
    else if (typeof p.semantic_score === 'number') score = p.semantic_score;
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
    },
    { onConflict: 'report_id,check_type' },
  );
  if (error) throw new Error(`analysis_results yazılamadı: ${error.message}`);

  return { kind: 'done', verdict, mocked: result.mocked };
}
