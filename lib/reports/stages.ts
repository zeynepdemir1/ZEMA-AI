import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * RAPOR AŞAMALARI (0010_report_stages.sql)
 *
 * TEKNOFEST'te bir yarışma sıralı birkaç rapor isteyebiliyor: Ön Tasarım
 * Raporu → Kritik Tasarım Raporu → Final. Her aşamanın kendi şablonu,
 * şartnamesi, rubriği ve teslim tarihi var.
 *
 * Yarışmada kalan: kategoriler, takımlar, benzerlik eşiği.
 * Aşamaya taşınan: template_spec, teslim tarihi, criteria, reports.
 */
export type ReportStage = {
  id: string;
  competitionId: string;
  name: string;
  sortOrder: number;
  submissionDeadline: string | null;
  templateSpec: Record<string, unknown>;
};

const SELECT = 'id, competition_id, name, sort_order, submission_deadline, template_spec';

function map(row: Record<string, unknown>): ReportStage {
  return {
    id: String(row.id),
    competitionId: String(row.competition_id),
    name: String(row.name),
    sortOrder: Number(row.sort_order ?? 1),
    submissionDeadline: (row.submission_deadline as string | null) ?? null,
    templateSpec: (row.template_spec ?? {}) as Record<string, unknown>,
  };
}

/** Bir yarışmanın aşamaları, sırayla. Oturum istemcisi — RLS geçerli. */
export async function loadStages(competitionId: string): Promise<ReportStage[]> {
  const db = await supabaseServer();
  const { data } = await db
    .from('report_stages')
    .select(SELECT)
    .eq('competition_id', competitionId)
    .order('sort_order', { ascending: true })
    // Beraberlikte sıra garanti olsun (0007'de yaşanan dersin aynısı).
    .order('id', { ascending: true });
  return (data ?? []).map(map);
}

/** Tek aşama. */
export async function loadStage(stageId: string): Promise<ReportStage | null> {
  const db = await supabaseServer();
  const { data } = await db.from('report_stages').select(SELECT).eq('id', stageId).maybeSingle();
  return data ? map(data) : null;
}

/**
 * Bir raporun aşaması — analiz hattı için, service_role ile.
 * Bileşik FK (0010) sayesinde aşamanın yarışması raporun yarışmasıyla
 * ZORUNLU olarak aynı; ayrıca kontrol etmeye gerek yok.
 */
export async function stageForReport(reportId: string): Promise<ReportStage | null> {
  const db = supabaseAdmin();
  const { data: report } = await db
    .from('reports')
    .select('stage_id')
    .eq('id', reportId)
    .maybeSingle();
  if (!report?.stage_id) return null;
  const { data } = await db.from('report_stages').select(SELECT).eq('id', report.stage_id).maybeSingle();
  return data ? map(data) : null;
}

/**
 * Yarışmanın varsayılan (ilk) aşaması. Tek aşamalı yarışmalarda
 * yarışmacıya aşama seçimi HİÇ gösterilmiyor; o durumda bu kullanılıyor.
 */
export async function defaultStage(competitionId: string): Promise<ReportStage | null> {
  const stages = await loadStages(competitionId);
  return stages[0] ?? null;
}

/**
 * Yeni bir rapor aşaması açar ("Kritik Tasarım Raporu" gibi).
 *
 * service_role ile yazılıyor (report_stages_write_admin politikası zaten
 * competition_admin'e kısıtlıyor; çağıran action rolü ayrıca doğruluyor —
 * diğer action'larla aynı iki katmanlı desen).
 */
export async function createStage(
  db: ReturnType<typeof supabaseAdmin>,
  competitionId: string,
  name: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { count } = await db
    .from('report_stages')
    .select('id', { count: 'exact', head: true })
    .eq('competition_id', competitionId);

  const { data, error } = await db
    .from('report_stages')
    .insert({
      competition_id: competitionId,
      name,
      sort_order: (count ?? 0) + 1,
      template_spec: {},
    })
    .select('id')
    .single();
  if (error) {
    // unique (competition_id, name)
    if (error.code === '23505') {
      return { ok: false, error: 'Bu yarışmada aynı adda bir aşama zaten var.' };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id };
}
