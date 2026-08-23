import { currentUser, supabaseServer } from '@/lib/supabase/server';

/**
 * Hakem ve yarışmacı ekranlarının veri kaynağı.
 *
 * Bu dosyadaki TÜM sorgular oturumlu istemciyle yapılır, yani §3.1'deki
 * erişim matrisi Postgres tarafında RLS ile uygulanır. Bir kullanıcının
 * görmemesi gereken satır sorgudan hiç dönmez — uygulama katmanında ayrıca
 * filtrelemeye gerek yok, ve unutulsa bile veri sızmaz.
 *
 * ⚠️ Buraya supabaseAdmin() EKLEMEYİN. Admin istemcisi RLS'i baypas eder ve
 * yalnızca sistem işleri için (job runner, rol atama, seed).
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
  const db = await supabaseServer();

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
  const db = await supabaseServer();
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
  const db = await supabaseServer();
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
  const db = await supabaseServer();
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

// ─────────────────────────────────────────────────────────────
// /evaluation — Değerlendirme Yöneticisi panosu
// ─────────────────────────────────────────────────────────────

export type DashData = {
  competition: { id: string; name: string; year: number };
  stats: { totalReports: number; analyzed: number; awaitingApproval: number; published: number };
  queue: Array<{
    reportId: string;
    code: string;
    team: string;
    judge: string;
    approved: number;
    total: number;
    checksDone: number;
    checksTotal: number;
    failed: number;
    badge: string;
    tone: 'gold' | 'teal' | 'muted' | 'danger';
  }>;
  workload: Array<{ name: string; assigned: number; capacity: number }>;
  updatedAt: string | null;
};

export async function loadDashboard(): Promise<DashData | null> {
  const db = await supabaseServer();

  const { data: competition } = await db
    .from('competitions')
    .select('id, name, year')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!competition) return null;

  const [{ data: reports }, { data: teams }, { data: jobs }, { data: scores }, { data: fb }, { data: assignments }, { data: judges }] =
    await Promise.all([
      db.from('reports').select('id, team_id, created_at').eq('competition_id', competition.id),
      db.from('teams').select('id, name'),
      db.from('analysis_jobs').select('report_id, status'),
      db.from('ai_criterion_scores').select('report_id, edit_status'),
      db.from('feedback').select('report_id, is_published, published_at'),
      db.from('assignments').select('report_id, judge_id'),
      db.from('profiles').select('id, full_name').eq('role', 'judge'),
    ]);

  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const judgeName = new Map((judges ?? []).map((j) => [j.id, j.full_name ?? '—']));
  const judgeOfReport = new Map((assignments ?? []).map((a) => [a.report_id, a.judge_id]));

  const list = reports ?? [];
  const queue: DashData['queue'] = list.map((r) => {
    const rJobs = (jobs ?? []).filter((j) => j.report_id === r.id);
    const rScores = (scores ?? []).filter((s) => s.report_id === r.id);
    const approved = rScores.filter((s) => s.edit_status !== 'ai_generated').length;
    const checksDone = rJobs.filter((j) => j.status === 'done').length;
    const failed = rJobs.filter((j) => j.status === 'failed').length;
    const rFb = (fb ?? []).find((f) => f.report_id === r.id);
    const assignedTo = judgeOfReport.get(r.id);

    let badge = 'KUYRUKTA';
    let tone: DashData['queue'][number]['tone'] = 'muted';
    if (failed > 0) {
      badge = 'HATA';
      tone = 'danger';
    } else if (rFb?.is_published) {
      badge = 'YAYINLANDI';
      tone = 'gold';
    } else if (rScores.length > 0 && approved === rScores.length) {
      badge = 'ONAYLANDI';
      tone = 'gold';
    } else if (checksDone > 0) {
      badge = 'İNCELEMEDE';
      tone = 'teal';
    } else if (!assignedTo) {
      badge = 'ATANMADI';
      tone = 'danger';
    }

    return {
      reportId: r.id,
      code: reportCode(r.id),
      team: teamName.get(r.team_id) ?? '—',
      judge: assignedTo ? (judgeName.get(assignedTo) ?? '—') : 'Atanmadı',
      approved,
      total: rScores.length,
      checksDone,
      checksTotal: rJobs.length,
      failed,
      badge,
      tone,
    };
  });

  const workload = (judges ?? []).map((j) => ({
    name: j.full_name ?? '—',
    assigned: (assignments ?? []).filter((a) => a.judge_id === j.id).length,
    capacity: 24,
  }));

  const analyzed = queue.filter((q) => q.checksTotal > 0 && q.checksDone === q.checksTotal).length;
  const awaitingApproval = queue.filter((q) => q.total > 0 && q.approved < q.total).length;
  const published = (fb ?? []).filter((f) => f.is_published).length;
  const lastPublish = (fb ?? [])
    .map((f) => f.published_at)
    .filter(Boolean)
    .sort()
    .pop();

  return {
    competition,
    stats: { totalReports: list.length, analyzed, awaitingApproval, published },
    queue,
    workload,
    updatedAt: (lastPublish as string | null) ?? (list.at(-1)?.created_at ?? null),
  };
}

// ─────────────────────────────────────────────────────────────
// /admin/competitions — Yarışma Yöneticisi kurulumu
// ─────────────────────────────────────────────────────────────

export type SetupData = {
  competition: {
    id: string;
    name: string;
    year: number;
    similarity_threshold: number;
    submission_deadline: string | null;
    template_spec: { required_sections?: string[]; max_pages?: number; citation_format?: string };
  };
  categories: Array<{ id: string; name: string; description: string; reportCount: number }>;
  criteria: Array<{ id: string; code: string; title: string; weightPct: number; maxScore: number }>;
  overThresholdPct: number;
};

export async function loadSetup(): Promise<SetupData | null> {
  const db = await supabaseServer();
  const { data: competition } = await db
    .from('competitions')
    .select('id, name, year, similarity_threshold, submission_deadline, template_spec')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!competition) return null;

  const [{ data: categories }, { data: criteria }, { data: reports }, { data: pairs }] =
    await Promise.all([
      db
        .from('categories')
        .select('id, name, description')
        .eq('competition_id', competition.id)
        .order('name'),
      db
        .from('criteria')
        .select('id, name, max_score, weight, sort_order')
        .eq('competition_id', competition.id)
        .order('sort_order'),
      db.from('reports').select('id, category_id').eq('competition_id', competition.id),
      db.from('similarity_pairs').select('report_id, semantic_score'),
    ]);

  const total = (reports ?? []).length;
  const over = (pairs ?? []).filter(
    (p) => (p.semantic_score ?? 0) >= competition.similarity_threshold,
  ).length;

  return {
    competition: {
      ...competition,
      template_spec: (competition.template_spec ?? {}) as SetupData['competition']['template_spec'],
    },
    categories: (categories ?? []).map((c) => ({
      ...c,
      reportCount: (reports ?? []).filter((r) => r.category_id === c.id).length,
    })),
    criteria: (criteria ?? []).map((c) => {
      const [code, ...rest] = c.name.split(' · ');
      return {
        id: c.id,
        code: code ?? c.name,
        title: rest.join(' · ') || c.name,
        weightPct: Math.round(Number(c.weight) * 100),
        maxScore: Number(c.max_score),
      };
    }),
    overThresholdPct: total ? Math.round((over / total) * 100) : 0,
  };
}

// ─────────────────────────────────────────────────────────────
// /evaluation/feedback/[id] — yayımlama akışı (§4.6)
// ─────────────────────────────────────────────────────────────

export type FeedbackContent = {
  summary?: string;
  strengths?: string[];
  improvements?: Array<{ area: string; what: string; how: string; priority: string }>;
  next_steps?: string[];
};

export type FeedbackDraft = {
  report: { id: string; code: string; title: string; team: string; category: string };
  feedbackId: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  content: FeedbackContent | null;
  /** Kontrol tamamlanmadıysa taslak henüz üretilmemiş olabilir. */
  synthesisDone: boolean;
};

export async function loadFeedbackDraft(reportId: string): Promise<FeedbackDraft | null> {
  const db = await supabaseServer();
  const { data: report } = await db
    .from('reports')
    .select('id, title, team_id, category_id')
    .eq('id', reportId)
    .maybeSingle();
  if (!report) return null;

  const [{ data: fb }, { data: team }, { data: category }, { data: job }] = await Promise.all([
    db
      .from('feedback')
      .select('id, content, is_published, published_at')
      .eq('report_id', reportId)
      .maybeSingle(),
    db.from('teams').select('name').eq('id', report.team_id).maybeSingle(),
    report.category_id
      ? db.from('categories').select('name').eq('id', report.category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('analysis_jobs')
      .select('status')
      .eq('report_id', reportId)
      .eq('check_type', 'feedback_synthesis')
      .maybeSingle(),
  ]);

  return {
    report: {
      id: report.id,
      code: reportCode(report.id),
      title: report.title,
      team: team?.name ?? '—',
      category: category?.name ?? '—',
    },
    feedbackId: fb?.id ?? null,
    isPublished: Boolean(fb?.is_published),
    publishedAt: fb?.published_at ?? null,
    content: (fb?.content ?? null) as FeedbackContent | null,
    synthesisDone: job?.status === 'done',
  };
}

/** Yayımlanmayı bekleyen raporlar — /evaluation'dan buraya giriş için. */
export async function loadFeedbackQueue() {
  const db = await supabaseServer();
  const { data: rows } = await db
    .from('feedback')
    .select('report_id, is_published, published_at');
  const ids = (rows ?? []).map((r) => r.report_id);
  if (!ids.length) return [];
  const [{ data: reports }, { data: teams }] = await Promise.all([
    db.from('reports').select('id, title, team_id').in('id', ids),
    db.from('teams').select('id, name'),
  ]);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  return (rows ?? []).map((r) => {
    const rep = (reports ?? []).find((x) => x.id === r.report_id);
    return {
      reportId: r.report_id,
      code: reportCode(r.report_id),
      title: rep?.title ?? '—',
      team: rep ? (teamName.get(rep.team_id) ?? '—') : '—',
      isPublished: r.is_published,
      publishedAt: r.published_at,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// /submissions — yarışmacının rapor listesi
// ─────────────────────────────────────────────────────────────

export type MyReport = {
  id: string;
  code: string;
  title: string;
  category: string;
  status: string;
  checksDone: number;
  checksTotal: number;
  failed: number;
  feedbackPublished: boolean;
  createdAt: string;
};

/** Yarışmacının takımına ait raporlar + yükleme formu için kategoriler. */
export async function loadMySubmissions() {
  const db = await supabaseServer();

  const user = await currentUser();
  if (!user) return null;
  const profile = { id: user.id, full_name: user.fullName };

  const { data: membership } = await db
    .from('team_members')
    .select('team_id, teams(id, name, competition_id)')
    .eq('user_id', profile.id)
    .maybeSingle();
  if (!membership) return null;
  const team = membership.teams as unknown as { id: string; name: string; competition_id: string };

  const [{ data: reports }, { data: categories }, { data: competition }] = await Promise.all([
    db
      .from('reports')
      .select('id, title, category_id, status, created_at')
      .eq('team_id', team.id)
      .order('created_at', { ascending: false }),
    db
      .from('categories')
      .select('id, name')
      .eq('competition_id', team.competition_id)
      .order('name'),
    db
      .from('competitions')
      .select('name, submission_deadline')
      .eq('id', team.competition_id)
      .maybeSingle(),
  ]);

  const ids = (reports ?? []).map((r) => r.id);
  const [{ data: jobs }, { data: fb }] = await Promise.all([
    ids.length
      ? db.from('analysis_jobs').select('report_id, status').in('report_id', ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? db.from('feedback').select('report_id, is_published').in('report_id', ids)
      : Promise.resolve({ data: [] }),
  ]);
  const catName = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const list: MyReport[] = (reports ?? []).map((r) => {
    const rJobs = (jobs ?? []).filter((j) => j.report_id === r.id);
    return {
      id: r.id,
      code: reportCode(r.id),
      title: r.title,
      category: catName.get(r.category_id ?? '') ?? 'Beyan edilmemiş',
      status: r.status,
      checksDone: rJobs.filter((j) => j.status === 'done').length,
      checksTotal: rJobs.length,
      failed: rJobs.filter((j) => j.status === 'failed').length,
      feedbackPublished: Boolean((fb ?? []).find((f) => f.report_id === r.id)?.is_published),
      createdAt: r.created_at,
    };
  });

  return {
    team: { name: team.name },
    competitor: profile.full_name ?? '—',
    competition: competition ?? { name: '—', submission_deadline: null },
    categories: categories ?? [],
    reports: list,
  };
}

/**
 * Hakemin ATANDIĞI raporlar. RLS zaten filtreliyor (reports_select_judge),
 * yani bu fonksiyon yalnızca sunum için gruplama yapıyor.
 */
export async function loadAssignedReports(): Promise<SidebarReport[]> {
  const db = await supabaseServer();
  const user = await currentUser();
  if (!user) return [];

  const { data: reports } = await db
    .from('reports')
    .select('id, team_id, category_id, competition_id')
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

// ─────────────────────────────────────────────────────────────
// /evaluation/assignments — hakem ataması (§6)
// ─────────────────────────────────────────────────────────────

export type AssignmentRow = {
  reportId: string;
  code: string;
  title: string;
  team: string;
  category: string;
  judgeId: string | null;
  judgeName: string | null;
  status: string | null;
  checksDone: number;
  checksTotal: number;
};

export type JudgeLoad = { id: string; name: string; assigned: number };

export async function loadAssignments() {
  const db = await supabaseServer();

  const { data: competition } = await db
    .from('competitions')
    .select('id, name')
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!competition) return null;

  const [{ data: reports }, { data: teams }, { data: cats }, { data: judges }, { data: assigns }, { data: jobs }] =
    await Promise.all([
      db
        .from('reports')
        .select('id, title, team_id, category_id')
        .eq('competition_id', competition.id)
        .order('created_at'),
      db.from('teams').select('id, name'),
      db.from('categories').select('id, name'),
      db.from('profiles').select('id, full_name').eq('role', 'judge').order('full_name'),
      db.from('assignments').select('report_id, judge_id, status'),
      db.from('analysis_jobs').select('report_id, status'),
    ]);

  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const judgeName = new Map((judges ?? []).map((j) => [j.id, j.full_name ?? '—']));

  const rows: AssignmentRow[] = (reports ?? []).map((r) => {
    const a = (assigns ?? []).find((x) => x.report_id === r.id);
    const rJobs = (jobs ?? []).filter((j) => j.report_id === r.id);
    return {
      reportId: r.id,
      code: reportCode(r.id),
      title: r.title,
      team: teamName.get(r.team_id) ?? '—',
      category: catName.get(r.category_id ?? '') ?? 'Beyan edilmemiş',
      judgeId: a?.judge_id ?? null,
      judgeName: a?.judge_id ? (judgeName.get(a.judge_id) ?? '—') : null,
      status: a?.status ?? null,
      checksDone: rJobs.filter((j) => j.status === 'done').length,
      checksTotal: rJobs.length,
    };
  });

  const loads: JudgeLoad[] = (judges ?? []).map((j) => ({
    id: j.id,
    name: j.full_name ?? '—',
    assigned: (assigns ?? []).filter((a) => a.judge_id === j.id).length,
  }));

  return { competition, rows, judges: loads };
}
