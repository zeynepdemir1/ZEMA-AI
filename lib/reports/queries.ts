import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Hakem ve yarışmacı ekranlarının veri kaynağı.
 *
 * ⚠️ GEÇİCİ: service_role istemcisi kullanılıyor, yani RLS BAYPAS EDİLİYOR.
 * Auth bağlandığında bu sorgular kullanıcı oturumlu istemciye taşınmalı ki
 * §3.1'deki erişim matrisi gerçekten uygulansın. docs/NOTES.md'de takipte.
 */

/** UUID'den okunabilir kayıt no. reports tablosunda `code` kolonu yok. */
export function reportCode(id: string): string {
  return `R-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

export type CriterionCardData = {
  criterionId: string;
  code: string;
  title: string;
  beklenti: string;
  status: 'done' | 'partial' | 'missing';
  origin: 'ai' | 'hakem';
  text: string;
  confidence: number | null;
  /** Kanıt alıntıları — 'exact' olmayanlar UI'da rozet alır (§4.5). */
  evidence: Array<{ quote: string; section_ref: string; match: string; verified: boolean }>;
  /** Kart başlığındaki bölüm referansı. */
  ref: string;
};

export type ReviewData = {
  report: {
    id: string;
    code: string;
    title: string;
    team: string;
    category: string;
    status: string;
  };
  cards: CriterionCardData[];
  similarity: { maxPct: number; matchCount: number; threshold: number };
  /** Analiz hâlâ sürüyorsa kısmi sonuç gösterilir (§2.1). */
  progress: { done: number; total: number; failed: number };
};

/** ai_criterion_scores.status → tasarımdaki rozet anahtarı */
const STATUS_MAP: Record<string, 'done' | 'partial' | 'missing'> = {
  done: 'done',
  partial: 'partial',
  not_done: 'missing',
};

export async function loadReview(reportId: string): Promise<ReviewData | null> {
  const db = supabaseAdmin();

  const { data: report } = await db
    .from('reports')
    .select('id, title, status, competition_id, category_id, team_id')
    .eq('id', reportId)
    .maybeSingle();
  if (!report) return null;

  const [{ data: team }, { data: category }, { data: competition }] = await Promise.all([
    db.from('teams').select('name').eq('id', report.team_id).maybeSingle(),
    report.category_id
      ? db.from('categories').select('name').eq('id', report.category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('competitions')
      .select('similarity_threshold')
      .eq('id', report.competition_id)
      .maybeSingle(),
  ]);

  // Rubrik + AI puanları ayrı çekilip JS'te birleştiriliyor — PostgREST'in
  // gömülü filtre sözdizimine bağımlı kalmamak için.
  const [{ data: criteria }, { data: scores }, { data: results }, { data: jobs }] =
    await Promise.all([
      db
        .from('criteria')
        .select('id, name, description, sort_order')
        .eq('competition_id', report.competition_id)
        .order('sort_order'),
      db
        .from('ai_criterion_scores')
        .select('criterion_id, status, score, confidence, ai_text, final_text, edit_status, evidence')
        .eq('report_id', reportId),
      db
        .from('analysis_results')
        .select('check_type, verdict, score, payload')
        .eq('report_id', reportId),
      db.from('analysis_jobs').select('status').eq('report_id', reportId),
    ]);

  const scoreByCriterion = new Map((scores ?? []).map((s) => [s.criterion_id, s]));

  const cards: CriterionCardData[] = (criteria ?? []).map((c) => {
    const s = scoreByCriterion.get(c.id);
    // criteria.name "K-01 · Problem Tanımı" biçiminde seed'lendi.
    const [code, ...rest] = c.name.split(' · ');
    const evidence = Array.isArray(s?.evidence)
      ? (s.evidence as CriterionCardData['evidence'])
      : [];
    const approved = s ? s.edit_status !== 'ai_generated' : false;

    return {
      criterionId: c.id,
      code: code ?? c.name,
      title: rest.join(' · ') || c.name,
      beklenti: c.description,
      status: STATUS_MAP[s?.status ?? ''] ?? 'missing',
      origin: approved ? 'hakem' : 'ai',
      text: s?.final_text ?? s?.ai_text ?? 'Bu kriter için analiz henüz tamamlanmadı.',
      confidence: s?.confidence ?? null,
      evidence,
      ref: evidence[0]?.section_ref ?? '—',
    };
  });

  const simResult = (results ?? []).find((r) => r.check_type === 'similarity');
  const simPayload = (simResult?.payload ?? {}) as {
    semantic_score?: number;
    matched_passages?: unknown[];
  };

  const jobList = jobs ?? [];
  return {
    report: {
      id: report.id,
      code: reportCode(report.id),
      title: report.title,
      team: team?.name ?? '—',
      category: category?.name ?? 'Kategori beyan edilmemiş',
      status: report.status,
    },
    cards,
    similarity: {
      maxPct: Math.round(simPayload.semantic_score ?? 0),
      matchCount: (simPayload.matched_passages ?? []).length,
      threshold: competition?.similarity_threshold ?? 50,
    },
    progress: {
      done: jobList.filter((j) => j.status === 'done').length,
      total: jobList.length,
      failed: jobList.filter((j) => j.status === 'failed').length,
    },
  };
}

export type SidebarReport = {
  id: string;
  code: string;
  team: string;
  category: string;
  status: 'onaylandı' | 'inceleniyor' | 'bekliyor' | 'dikkat';
  approved: number;
  total: number;
};

/**
 * Kenar çubuğu listesi.
 * ⚠️ GEÇİCİ: assignments tablosu boş olduğu için hakemin ATANDIĞI raporlar
 * yerine yarışmanın TÜM raporları listeleniyor. Auth + atama akışı gelince
 * assignments üzerinden filtrelenmeli.
 */
export async function loadSidebarReports(competitionId: string): Promise<SidebarReport[]> {
  const db = supabaseAdmin();
  const { data: reports } = await db
    .from('reports')
    .select('id, team_id, category_id, status')
    .eq('competition_id', competitionId)
    .order('created_at');
  if (!reports?.length) return [];

  const [{ data: teams }, { data: cats }, { data: scores }] = await Promise.all([
    db.from('teams').select('id, name'),
    db.from('categories').select('id, name'),
    db.from('ai_criterion_scores').select('report_id, edit_status'),
  ]);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));

  return reports.map((r) => {
    const mine = (scores ?? []).filter((s) => s.report_id === r.id);
    const approved = mine.filter((s) => s.edit_status !== 'ai_generated').length;
    const status: SidebarReport['status'] =
      mine.length === 0
        ? 'bekliyor'
        : approved === mine.length
          ? 'onaylandı'
          : approved > 0
            ? 'inceleniyor'
            : 'dikkat';
    return {
      id: r.id,
      code: reportCode(r.id),
      team: teamName.get(r.team_id) ?? '—',
      category: catName.get(r.category_id ?? '') ?? 'Diğer',
      status,
      approved,
      total: mine.length,
    };
  });
}

/** Yarışmacı ekranı — YALNIZCA yayımlanmış geri bildirim (§3.1 kritik kuralı). */
export async function loadPublishedFeedback(reportId: string) {
  const db = supabaseAdmin();
  const { data: report } = await db
    .from('reports')
    .select('id, title, status, team_id, category_id')
    .eq('id', reportId)
    .maybeSingle();
  if (!report) return null;

  const { data: fb } = await db
    .from('feedback')
    .select('content, is_published, published_at')
    .eq('report_id', reportId)
    .eq('is_published', true)
    .maybeSingle();

  const [{ data: team }, { data: category }] = await Promise.all([
    db.from('teams').select('name').eq('id', report.team_id).maybeSingle(),
    report.category_id
      ? db.from('categories').select('name').eq('id', report.category_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const content = (fb?.content ?? null) as {
    summary?: string;
    strengths?: string[];
    improvements?: Array<{ area: string; what: string; how: string; priority: string }>;
    next_steps?: string[];
  } | null;

  return {
    report: {
      code: reportCode(report.id),
      title: report.title,
      team: team?.name ?? '—',
      category: category?.name ?? '—',
      status: report.status,
    },
    published: Boolean(fb?.is_published),
    publishedAt: fb?.published_at ?? null,
    content,
  };
}

export type SimilarityMatch = {
  pairId: string;
  otherReportId: string;
  otherTeam: string;
  otherCode: string;
  semanticScore: number;
  lexicalScore: number | null;
  verdict: 'pending' | 'confirmed' | 'false_positive';
  assessment: string;
  passages: Array<{ a: string; b: string; note: string; a_section_ref: string; b_section_ref: string }>;
};

/** §4.4 — benzerlik detayı. Kapsam kesintisi sonrası yalnızca metin. */
export async function loadSimilarity(reportId: string) {
  const db = supabaseAdmin();
  const { data: report } = await db
    .from('reports')
    .select('id, title, team_id, competition_id')
    .eq('id', reportId)
    .maybeSingle();
  if (!report) return null;

  const [{ data: team }, { data: competition }, { data: pairs }] = await Promise.all([
    db.from('teams').select('name').eq('id', report.team_id).maybeSingle(),
    db.from('competitions').select('similarity_threshold').eq('id', report.competition_id).maybeSingle(),
    db
      .from('similarity_pairs')
      .select('id, other_report_id, semantic_score, lexical_score, judge_verdict, evidence')
      .eq('report_id', reportId)
      .order('semantic_score', { ascending: false }),
  ]);

  const otherIds = (pairs ?? []).map((p) => p.other_report_id);
  const { data: others } = otherIds.length
    ? await db.from('reports').select('id, team_id').in('id', otherIds)
    : { data: [] };
  const { data: allTeams } = await db.from('teams').select('id, name');
  const teamById = new Map((allTeams ?? []).map((t) => [t.id, t.name]));
  const teamOfReport = new Map((others ?? []).map((r) => [r.id, teamById.get(r.team_id) ?? '—']));

  const matches: SimilarityMatch[] = (pairs ?? []).map((p) => {
    const ev = (p.evidence ?? {}) as { matched_passages?: SimilarityMatch['passages']; assessment?: string };
    return {
      pairId: p.id,
      otherReportId: p.other_report_id,
      otherTeam: teamOfReport.get(p.other_report_id) ?? '—',
      otherCode: reportCode(p.other_report_id),
      semanticScore: Math.round(p.semantic_score ?? 0),
      lexicalScore: p.lexical_score,
      verdict: p.judge_verdict,
      assessment: ev.assessment ?? '',
      passages: ev.matched_passages ?? [],
    };
  });

  return {
    report: { id: report.id, code: reportCode(report.id), team: team?.name ?? '—' },
    threshold: competition?.similarity_threshold ?? 50,
    matches,
  };
}
