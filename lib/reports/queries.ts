import { currentUser, supabaseServer } from '@/lib/supabase/server';
import { CHECK_SCORING, verdictFromScore, type CheckType } from '@/lib/ai/config';

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

/**
 * Varsayılan yarışmayı (competitionId verilmediğinde) İLK OLUŞTURULANA
 * göre bulur — 0007_competitions_created_at.sql ile eklenen `created_at`
 * kolonuna göre. Bu kolon henüz migration çalıştırılmadıysa Postgres
 * "column does not exist" hatası döner; o durumda sessizce eski "en
 * yüksek yıl" davranışına düşülür — migration koşulmadan siteyi kırmasın
 * (0006_judge_notes.sql'deki "kolon yokluğunu yakala" deseniyle aynı).
 */
async function firstCompetition(
  db: Awaited<ReturnType<typeof supabaseServer>>,
  select: string,
): Promise<Record<string, unknown> | null> {
  const byCreated = await db
    .from('competitions')
    .select(select)
    .order('created_at', { ascending: true })
    // İKİNCİL ANAHTAR ZORUNLU: 0007 migration'ı mevcut satırların
    // created_at'ini `default now()` ile TEK SEFERDE doldurdu, yani iki
    // yarışmanın değeri BİREBİR aynı. Beraberlikte Postgres satır sırası
    // garanti değil — varsayılan yarışma istekler arasında değişebiliyordu.
    // Sahada ısırdı: şartname İHA'ya yüklendi ama yönetici ekranı Model
    // Uydu yarışmasını gösterdi ve "şartname yüklenmedi" yazdı.
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!byCreated.error) return byCreated.data as Record<string, unknown> | null;

  const byYear = await db
    .from('competitions')
    .select(select)
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle();
  return byYear.data as Record<string, unknown> | null;
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

/**
 * Bir AI kontrolünün hakem ekranında gösterilecek hali.
 *
 * ⚠️ Bu tip eklenene kadar dört kontrol (language_template, title_content,
 * category_fit, feedback_synthesis) çalışıyor ama SONUÇLARI HİÇ
 * GÖSTERİLMİYORDU: loadReview analysis_results'u sorguluyor, yalnızca
 * benzerlik yüzdesini alıp geri kalanını atıyordu. Şartname altı
 * gereksinimin hepsinin görünür olmasını gerektiriyor.
 */
export type CheckResultView = {
  type: string;
  label: string;
  verdict: string;
  /** Yalnızca `numeric` kontrollerde dolu; judgment kontrollerde null. */
  score: number | null;
  /** 'numeric' → yüzde + eşik kararı · 'judgment' → modelin kendi yargısı */
  scoring: 'numeric' | 'judgment';
  model: string;
  payload: Record<string, unknown>;
  /** Hakemin yazdığı metin; null ise henüz dokunmamış. */
  judgeNote: string | null;
  /**
   * Metin kutusuna ÖN DOLU gelecek değer: hakem yazdıysa onun metni,
   * yazmadıysa sorun varsa AI'nin önerisi, sorun yoksa standart cümle.
   */
  suggestedNote: string;
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
  /** Altı kontrolün tamamı — kriter kartları dışındakiler de gösterilir. */
  checks: CheckResultView[];
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
    .select('id, title, status, competition_id, category_id, team_id, stage_id')
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
        // Kriterler AŞAMAYA bağlı (0010): competition_id ile filtrelemek
        // çok aşamalı bir yarışmada TÜM aşamaların rubriğini karıştırırdı.
        .select('id, name, description, sort_order')
        .eq('stage_id', report.stage_id)
        .order('sort_order'),
      db
        .from('ai_criterion_scores')
        .select('criterion_id, status, score, confidence, ai_text, final_text, edit_status, evidence')
        .eq('report_id', reportId),
      // judge_note 0006 migration'ıyla geliyor. Kolon yokken tüm sorgu
      // 42703 ile düşüyor ve panel SESSİZCE boşalıyordu — yanıltıcı bir
      // bozulma. Yoksa kolonsuz tekrar deneniyor.
      selectAnalysisResults(db, reportId),
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

  const CHECK_LABELS: Record<string, string> = {
    language_template: 'Dil ve Şablon Uyumu',
    title_content: 'Başlık-İçerik Tutarlılığı',
    category_fit: 'Kategori Uygunluğu',
    similarity: 'Benzerlik / Özgünlük',
    criteria_scoring: 'Kriter Bazlı Değerlendirme',
    feedback_synthesis: 'Yarışmacı Geri Bildirimi',
  };
  const CHECK_ORDER = Object.keys(CHECK_LABELS);

  // category_fit payload'ında kategori UUID'si var; hakeme UUID göstermek
  // anlamsız — okunabilir adla zenginleştir.
  const checks: CheckResultView[] = CHECK_ORDER.flatMap((type) => {
    const r = (results ?? []).find((x) => x.check_type === type);
    if (!r) return [];
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    // Karar OKUMA anında da eşikten türetiliyor: eşik değiştiğinde ya da
    // eski satırlar farklı mantıkla yazılmışken ekran tutarsız kalmasın.
    const scoring = CHECK_SCORING[type as CheckType] ?? 'judgment';
    const stored = r.verdict ?? 'insufficient_evidence';
    let verdict = stored;
    let score: number | null = r.score ?? null;

    if (scoring === 'numeric') {
      if (stored !== 'insufficient_evidence' && typeof score === 'number') {
        verdict = verdictFromScore(score);
      }
    } else {
      // Judgment kontrollerinde yapay yüzde GÖSTERİLMEZ.
      score = null;
    }

    return [
      {
        type,
        label: CHECK_LABELS[type],
        verdict,
        score,
        scoring,
        model: r.model ?? '—',
        payload,
        judgeNote: (r as { judge_note?: string | null }).judge_note ?? null,
        suggestedNote:
          (r as { judge_note?: string | null }).judge_note ??
          suggestNote(type, verdict, payload),
      },
    ];
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
    checks,
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

/**
 * Hakemin metin kutusuna ön dolu gelecek öneri.
 *
 * Sorun yoksa standart cümle; varsa AI'nin kendi ifadesinden türetilir.
 * Hakem her iki durumda da serbestçe değiştirebilir.
 */
const NO_ISSUE = 'Bu kriterde eksiklik tespit edilmedi.';

function suggestNote(
  type: string,
  verdict: string,
  p: Record<string, unknown>,
): string {
  if (verdict === 'pass') return NO_ISSUE;

  if (type === 'language_template') {
    const secs = (p.sections ?? []) as Array<{ name: string; present: boolean; substantive: boolean }>;
    const missing = secs.filter((s) => !s.present).map((s) => s.name);
    const empty = secs.filter((s) => s.present && !s.substantive).map((s) => s.name);
    const issues = (p.language_issues ?? []) as Array<{ issue_type: string }>;
    const spelling = issues.filter((i) => i.issue_type === 'imla').length;
    const parts: string[] = [];
    if (missing.length) parts.push(`Şu zorunlu bölümler eksik: ${missing.join(', ')}.`);
    if (empty.length) parts.push(`Şu bölümlerin başlığı var ama içeriği yetersiz: ${empty.join(', ')}.`);
    if (spelling) parts.push(`Raporda ${spelling} yazım hatası tespit edildi; metni bir kez daha gözden geçirin.`);
    return parts.join(' ') || NO_ISSUE;
  }

  if (type === 'title_content') {
    const unmet = (p.unmet_promises ?? []) as Array<{ promise: string }>;
    const suggested = (p.suggested_titles ?? []) as string[];
    const parts: string[] = [];
    if (unmet.length)
      parts.push(
        `Başlığın vaat ettiği ${unmet.map((u) => `"${u.promise}"`).join(', ')} içerikte karşılanmıyor.`,
      );
    if (suggested.length) parts.push(`Alternatif başlık önerisi: ${suggested[0]}`);
    return parts.join(' ') || NO_ISSUE;
  }

  if (type === 'category_fit') {
    const q = String(p.conflicting_quote ?? '').trim();
    const reason = String(p.reason ?? '');
    if (!q) return reason || NO_ISSUE;
    return `Raporun "${q}" ifadesi beyan edilen kategoriyle örtüşmüyor. ${reason}`;
  }

  if (type === 'similarity') {
    const score = Number(p.semantic_score ?? 0);
    const passages = (p.matched_passages ?? []) as unknown[];
    if (!passages.length) return NO_ISSUE;
    return `Rapor, aynı kategorideki başka bir raporla %${score} oranında metin örtüşmesi gösteriyor; ${passages.length} pasaj eşleşti. Özgünlük açısından gözden geçirilmesi gerekiyor.`;
  }

  return NO_ISSUE;
}

/** analysis_results seçimi — judge_note kolonu yokken kolonsuz devam eder. */
async function selectAnalysisResults(
  db: Awaited<ReturnType<typeof supabaseServer>>,
  reportId: string,
) {
  const withNote = await db
    .from('analysis_results')
    .select('check_type, verdict, score, payload, model, judge_note')
    .eq('report_id', reportId);
  if (!withNote.error) return withNote;

  if (withNote.error.code === '42703') {
    // 0006 henüz çalıştırılmamış.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[zema] analysis_results.judge_note yok — 0006_judge_notes.sql çalıştırılmalı. ' +
          'Hakem geri bildirim kutuları kaydetmeyecek.',
      );
    }
    return db
      .from('analysis_results')
      .select('check_type, verdict, score, payload, model')
      .eq('report_id', reportId);
  }
  return withNote;
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

  // İLK oluşturulan yarışma (bkz. 0007_competitions_created_at.sql) —
  // /admin/competitions'ta yeni bir yarışma açılsa bile bu ekran demo
  // yarışmasını göstermeye devam eder. Burada henüz bir yarışma seçici
  // yok; "en yüksek yıl" ile seçmek, kullanıcının yılını değiştirdiği
  // AYNI yarışmayı farklı bir kayıt sanmasına yol açmıştı.
  const raw = await firstCompetition(db, 'id, name, year');
  if (!raw) return null;
  const competition = raw as { id: string; name: string; year: number };

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

/** `template_spec` biçimi — artık AŞAMAYA bağlı (0010_report_stages.sql). */
export type TemplateSpec = {
  report_type?: string;
  required_sections?: string[];
  citation_format?: string;
  format?: {
    font?: string;
    page?: string;
    alignment?: string;
    max_pages?: number;
    footer?: string;
  };
  content_rules?: string[];
  not_specified?: string[];
  /** Eski (tek belgeli) künye alanı — şablonu ifade eder. `sources` ile aynı şekil. */
  source?: {
    file_path?: string;
    model?: string;
    extracted_at?: string;
    page_count?: number;
    quotes_verified?: number;
    quotes_total?: number;
    fields?: string[];
    declares?: string;
  };
  /**
   * İKİ BELGELİ KÜNYE: hangi alan hangi PDF'ten geldi.
   * `source` tarihsel olarak yalnızca şablonu ifade ediyordu; şartname
   * eklenince tek alan yetmedi (bkz. lib/reports/spec-sources.ts).
   */
  sources?: Partial<
    Record<
      'sablon' | 'sartname',
      {
        file_path?: string;
        model?: string;
        extracted_at?: string;
        page_count?: number;
        quotes_verified?: number;
        quotes_total?: number;
        fields?: string[];
        declares?: string;
      }
    >
  >;
  /** Çıkarım öncesindeki spec — yanlış çıkarımdan dönmek için. */
  previous?: unknown;
};

export type SetupData = {
  competition: {
    id: string;
    name: string;
    year: number;
    language: string;
    similarity_threshold: number;
    submission_deadline: string | null;
  };
  /** "Rapor Aşaması" seçici için — bir yarışmanın TÜM aşamaları, sırayla. */
  stages: Array<{ id: string; name: string; sortOrder: number }>;
  activeStageId: string;
  /** Seçili aşamanın şablon/şartname çıkarımı — competitions.template_spec DEĞİL. */
  stage: {
    id: string;
    name: string;
    templateSpec: TemplateSpec;
  };
  categories: Array<{ id: string; name: string; description: string; reportCount: number }>;
  /** Seçili AŞAMANIN kriterleri — her teslimin kendi rubriği var. */
  criteria: Array<{
    id: string;
    code: string;
    title: string;
    description: string;
    weightPct: number;
    maxScore: number;
  }>;
  overThresholdPct: number;
};

/** Yarışma seçici (admin sekmeleri) için tüm yarışmaların kısa listesi. */
export async function loadAllCompetitions(): Promise<Array<{ id: string; name: string; year: number }>> {
  const db = await supabaseServer();
  const byCreated = await db
    .from('competitions')
    .select('id, name, year')
    .order('created_at', { ascending: true });
  if (!byCreated.error) return byCreated.data ?? [];
  // created_at kolonu yok — 0007 migration'ı henüz koşulmamış.
  const byYear = await db.from('competitions').select('id, name, year').order('year', { ascending: false });
  return byYear.data ?? [];
}

/**
 * competitionId verilirse o yarışmayı yükler (admin sekmelerindeki
 * yarışma seçicinin seçtiği). Verilmezse İLK oluşturulan yarışmaya düşer
 * (bkz. loadDashboard() — "en yüksek yıl" artık seçim anahtarı değil).
 *
 * stageId verilirse o AŞAMA aktif olur (bkz. app/admin/competitions/
 * stage-switcher.tsx); verilmezse ya da o yarışmaya ait değilse yarışmanın
 * İLK aşamasına düşülür. Şablon/şartname/kriterler artık aşamaya bağlı
 * (0010_report_stages.sql) — competitions.template_spec DEĞİL.
 */
export async function loadSetup(competitionId?: string, stageId?: string): Promise<SetupData | null> {
  const db = await supabaseServer();
  const SELECT = 'id, name, year, language, similarity_threshold, submission_deadline';
  const raw = competitionId
    ? (await db.from('competitions').select(SELECT).eq('id', competitionId).maybeSingle()).data
    : await firstCompetition(db, SELECT);
  if (!raw) return null;
  const competition = raw as {
    id: string;
    name: string;
    year: number;
    language: string;
    similarity_threshold: number;
    submission_deadline: string | null;
  };

  const { data: stageRows } = await db
    .from('report_stages')
    .select('id, name, sort_order, template_spec')
    .eq('competition_id', competition.id)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  const stages = stageRows ?? [];
  // Her yarışmanın en az bir aşaması olmalı (migration + createCompetition
  // ikisi de garanti ediyor) — boşsa kurulum ekranı gösterilecek bir şey yok.
  if (!stages.length) return null;
  const activeStage = stages.find((s) => s.id === stageId) ?? stages[0];

  const [{ data: categories }, { data: criteria }, { data: reports }, { data: pairs }] =
    await Promise.all([
      db
        .from('categories')
        .select('id, name, description')
        .eq('competition_id', competition.id)
        .order('name'),
      db
        .from('criteria')
        // Kriterler de AŞAMAYA bağlı: her teslimin kendi rubriği var.
        .select('id, name, description, max_score, weight, sort_order')
        .eq('stage_id', activeStage.id)
        .order('sort_order'),
      db.from('reports').select('id, category_id').eq('competition_id', competition.id),
      db.from('similarity_pairs').select('report_id, semantic_score'),
    ]);

  const total = (reports ?? []).length;
  const over = (pairs ?? []).filter(
    (p) => (p.semantic_score ?? 0) >= competition.similarity_threshold,
  ).length;

  return {
    competition,
    stages: stages.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sort_order ?? 1 })),
    activeStageId: activeStage.id,
    stage: {
      id: activeStage.id,
      name: activeStage.name,
      templateSpec: (activeStage.template_spec ?? {}) as TemplateSpec,
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
        description: c.description ?? '',
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
  team: string;
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

  // ⚠️ maybeSingle() KULLANMA: bir kullanıcı birden çok takımda olabilir
  // (demo seed'i yarışmacıyı 9 takıma ekliyor) ve maybeSingle çok satırda
  // hata verip sayfayı boşaltıyor.
  const { data: memberships } = await db
    .from('team_members')
    .select('team_id, teams(id, name, competition_id)')
    .eq('user_id', profile.id);
  if (!memberships?.length) return null;

  const teams = memberships
    .map((m) => m.teams as unknown as { id: string; name: string; competition_id: string })
    .filter(Boolean);
  const team = teams[0];

  // TÜM yarışmalar çekiliyor, yalnızca kullanıcının takımı olan değil.
  // Sahada çıkan hata buydu: yönetici yeni yarışma eklediğinde yarışmacı
  // onu göremiyordu, çünkü yarışma kullanıcının İLK TAKIMINDAN türüyordu.
  // RLS engel değil — competitions_select_all herkese `using (true)` veriyor.
  const [{ data: reports }, { data: allCategories }, { data: allCompetitions }, { data: allStages }] =
    await Promise.all([
      db
        .from('reports')
        .select('id, title, category_id, status, created_at, team_id')
        .in(
          'team_id',
          teams.map((t) => t.id),
        )
        .order('created_at', { ascending: false }),
      db.from('categories').select('id, name, competition_id').order('name'),
      db
        .from('competitions')
        .select('id, name, submission_deadline')
        .order('created_at', { ascending: true }),
      // Aşama seçici için (0010) — tek aşamalı yarışmalarda formda hiç
      // gösterilmiyor (bkz. upload-form.tsx), ama veri her zaman geliyor.
      db.from('report_stages').select('id, name, sort_order, competition_id').order('sort_order'),
    ]);

  const competitions = (allCompetitions ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    submission_deadline: c.submission_deadline as string | null,
    categories: (allCategories ?? [])
      .filter((k) => k.competition_id === c.id)
      .map((k) => ({ id: k.id, name: k.name })),
    stages: (allStages ?? [])
      .filter((s) => s.competition_id === c.id)
      .map((s) => ({ id: s.id, name: s.name })),
  }));

  // Varsayılan seçim: kullanıcının takımının olduğu yarışma; yoksa ilki.
  const active =
    competitions.find((c) => c.id === team.competition_id) ?? competitions[0] ?? null;
  const categories = active?.categories ?? [];
  const competition = active
    ? { name: active.name, submission_deadline: active.submission_deadline }
    : null;

  const ids = (reports ?? []).map((r) => r.id);
  // ⚠️ analysis_jobs yarışmacı için RLS ile GİZLİ (§3.1: ham AI analizi
  // yarışmacıya açılmaz) — bu sorgu bilinçli olarak 0 satır döner ve
  // kontrol ilerlemesi çubuğu render edilmez. Yarışmacı durumu
  // reports.status rozetinden görür. Yükleme sırasındaki canlı ilerleme
  // /api/jobs/tick yanıtından besleniyor, bu sorgudan değil.
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
      team: teams.find((t) => t.id === r.team_id)?.name ?? '—',
      category: catName.get(r.category_id ?? '') ?? 'Beyan edilmemiş',
      status: r.status,
      checksDone: rJobs.filter((j) => j.status === 'done').length,
      checksTotal: rJobs.length,
      failed: rJobs.filter((j) => j.status === 'failed').length,
      feedbackPublished: Boolean((fb ?? []).find((f) => f.report_id === r.id)?.is_published),
      createdAt: r.created_at,
    };
  });

  const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

  return {
    // Birden çok takım varsa hepsini göster (demo verisinde 9 takım var).
    team: { name: teams.length > 1 ? `${teams.length} takım` : team.name },
    teamNameById,
    competitor: profile.full_name ?? '—',
    competition: competition ?? { name: '—', submission_deadline: null },
    /** Yükleme formundaki yarışma seçici için — hepsi, kategorileriyle. */
    competitions,
    /** Kullanıcının TAKIMI OLAN yarışmalar. Diğerlerinde önce takım kurulur. */
    teamCompetitionIds: [...new Set(teams.map((t) => t.competition_id))],
    activeCompetitionId: active?.id ?? null,
    categories,
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

  // bkz. loadDashboard() — ilk oluşturulan yarışma, "en yüksek yıl" değil.
  const raw = await firstCompetition(db, 'id, name');
  if (!raw) return null;
  const competition = raw as { id: string; name: string };

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
