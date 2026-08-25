import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';

export type UploaderTeam = {
  userId: string;
  teamId: string;
  competitionId: string;
  /** Takım bu istek sırasında mı açıldı? Denetim kaydına yazılıyor. */
  teamCreated: boolean;
};

/**
 * Yükleme yapan yarışmacının SEÇİLEN YARIŞMADAKİ takımını çözer.
 *
 * NEDEN YARIŞMA PARAMETRESİ VAR — sahada çıkan hata: yarışmacı, yönetici
 * yeni bir yarışma eklediğinde onu rapor yükleme ekranında GÖREMİYORDU.
 * Sebep RLS değil (`competitions_select_all` herkese `using (true)` veriyor)
 * ve bir "yayımlandı" alanı da yok — sebep buydu: takım çözümü
 * `memberships[0]`ı, yani kullanıcının RASTGELE İLK takımını alıyordu ve
 * yarışma o takımdan türüyordu. Yarışmacı hangi yarışmaya yüklemek isterse
 * istesin, hep ilk takımının yarışmasına yüklüyordu.
 *
 * TAKIM YOKSA AÇILIYOR. Yeni yarışmanın hiç takımı olmuyor (ölçüldü:
 * "TEKNOFEST 2025 — Model Uydu" 0 takım). `reports.team_id` NOT NULL
 * olduğu için takımsız yükleme mümkün değil; yarışmacı yönetici kendisine
 * takım açana kadar o yarışmaya HİÇ giremezdi. Bu yüzden seçilen yarışmada
 * takımı yoksa adına bir takım açılıp üye ediliyor.
 *
 * Not: `teams_write_admin` politikası takım yazmayı competition_admin'e
 * kısıtlıyor; burada service_role kullanıldığı için RLS baypas ediliyor.
 * Yetki kontrolü zaten yapıldı (rol = competitor) ve açılan takım
 * yalnızca bu kullanıcıya bağlanıyor.
 *
 * maybeSingle() KULLANILMIYOR: bir kullanıcı birden çok takımda olabilir
 * (demo hesabı dokuz takımda) ve tekil beklemek yüklemeyi tamamen kırmıştı.
 */
export async function resolveUploaderTeam(
  competitionId?: string,
): Promise<
  | { ok: true; team: UploaderTeam }
  | { ok: false; status: number; error: string; needsTeam?: boolean }
> {
  const user = await currentUser();
  if (!user) return { ok: false, status: 401, error: 'Giriş yapmalısınız.' };
  if (user.role !== 'competitor') {
    return { ok: false, status: 403, error: 'Yalnızca yarışmacılar rapor yükleyebilir.' };
  }

  const db = supabaseAdmin();
  const { data: memberships, error } = await db
    .from('team_members')
    .select('team_id, teams(id, competition_id)')
    .eq('user_id', user.id);
  if (error) return { ok: false, status: 500, error: error.message };

  const teams = (memberships ?? [])
    .map((m) => m.teams as unknown as { id: string; competition_id: string })
    .filter(Boolean);

  // Yarışma belirtilmediyse eski davranış: ilk takım. (Geriye dönük
  // uyumluluk — multipart yolu ve eski istemciler için.)
  if (!competitionId) {
    if (!teams.length) return { ok: false, status: 409, error: 'Kullanıcı bir takıma bağlı değil' };
    const t = teams[0];
    return {
      ok: true,
      team: { userId: user.id, teamId: t.id, competitionId: t.competition_id, teamCreated: false },
    };
  }

  const existing = teams.find((t) => t.competition_id === competitionId);
  if (existing) {
    return {
      ok: true,
      team: { userId: user.id, teamId: existing.id, competitionId, teamCreated: false },
    };
  }

  // TAKIM YOKSA SESSİZCE AÇMIYORUZ. Önceki sürüm kullanıcı adına arka planda
  // takım açıyordu; artık kullanıcı "Takım Oluştur" formunu doldurup
  // onaylıyor (bkz. app/submissions/new/team-form.tsx). Rota bu durumu
  // ayırt edilebilir bir kodla bildiriyor ki istemci formu gösterebilsin.
  return {
    ok: false,
    status: 409,
    error: 'Bu yarışmada takımınız yok. Önce takım oluşturmalısınız.',
    needsTeam: true,
  };
}

/** 0002_rls.sql'deki yol kuralı: <team_id>/<uuid>.pdf */
export function storagePathFor(teamId: string): string {
  return `${teamId}/${crypto.randomUUID()}.pdf`;
}

/** Yol gerçekten bu takıma mı ait? İstemci gövdesinden gelen yolu doğrulamak için. */
export function pathBelongsToTeam(path: string, teamId: string): boolean {
  return path.startsWith(`${teamId}/`) && !path.includes('..') && path.endsWith('.pdf');
}

/**
 * KATILIM KURALI (katman 1) — bir takım, bir AŞAMAYA en fazla bir kez.
 *
 * 0010_report_stages.sql kısıtı yarışma düzeyinden aşama düzeyine indi:
 * `unique (team_id, stage_id)`. Sebep: ÖTR verip sonra KTR vermek aynı
 * takımın NORMAL akışı, ikinci bir katılım değil — eski
 * `unique (team_id, competition_id)` kısıtı çok aşamalı bir yarışmada
 * KTR'yi tamamen engellerdi.
 *
 * Kategoriden BAĞIMSIZ: aynı takım aynı aşamanın farklı kategorilerine
 * ayrı ayrı başvuramaz. Bu yüzden sorgu yalnızca (team_id, stage_id)
 * bakıyor, category_id'ye bakmıyor.
 *
 * Tek aşamalı yarışmalarda davranış birebir eskisi gibi (tek aşama →
 * aşama kısıtı yarışma kısıtına denk).
 */
export async function findExistingEntry(
  teamId: string,
  stageId: string,
): Promise<{ id: string; title: string } | null> {
  const { data } = await supabaseAdmin()
    .from('reports')
    .select('id, title')
    .eq('team_id', teamId)
    .eq('stage_id', stageId)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export function alreadyEnteredMessage(title: string, stageName: string): string {
  return (
    `"${stageName}" aşaması için takımınız adına zaten bir rapor gönderildi ("${title}"). ` +
    'Bir takım, bir aşamaya kategoriden bağımsız olarak yalnızca bir kez ' +
    'katılabilir. Mevcut raporunuzu güncellemek istiyorsanız yarışma ' +
    'yöneticisiyle iletişime geçin.'
  );
}
