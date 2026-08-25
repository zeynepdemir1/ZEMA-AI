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
): Promise<{ ok: true; team: UploaderTeam } | { ok: false; status: number; error: string }> {
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

  // Yarışma gerçekten var mı? İstemciden gelen kimliğe güvenilmiyor.
  const { data: comp } = await db
    .from('competitions')
    .select('id')
    .eq('id', competitionId)
    .maybeSingle();
  if (!comp) return { ok: false, status: 404, error: 'Yarışma bulunamadı.' };

  const teamName = `${user.fullName?.trim() || user.email || 'Yarışmacı'} Takımı`;
  const { data: created, error: ce } = await db
    .from('teams')
    .insert({ competition_id: competitionId, name: teamName })
    .select('id')
    .single();
  if (ce) return { ok: false, status: 500, error: `Takım oluşturulamadı: ${ce.message}` };

  const { error: me } = await db
    .from('team_members')
    .insert({ team_id: created.id, user_id: user.id });
  if (me) {
    await db.from('teams').delete().eq('id', created.id); // yetim takım bırakma
    return { ok: false, status: 500, error: `Takıma eklenemedi: ${me.message}` };
  }

  return {
    ok: true,
    team: { userId: user.id, teamId: created.id, competitionId, teamCreated: true },
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
