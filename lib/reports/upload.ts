import { supabaseAdmin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';

export type UploaderTeam = { userId: string; teamId: string; competitionId: string };

/**
 * Yükleme yapan yarışmacının takımını OTURUMDAN çözer.
 *
 * İstemciden gelen takım/yarışma bilgisine güvenilmiyor: hem imzalı URL'nin
 * yol adı hem reports satırının team_id'si buradan geliyor. Böylece bir
 * yarışmacı başka bir takımın klasörüne yazamıyor.
 *
 * maybeSingle() KULLANILMIYOR: bir kullanıcı birden çok takımda olabilir
 * (demo hesabı dokuz takımda) ve tekil beklemek yüklemeyi tamamen kırmıştı.
 */
export async function resolveUploaderTeam(): Promise<
  { ok: true; team: UploaderTeam } | { ok: false; status: number; error: string }
> {
  const user = await currentUser();
  if (!user) return { ok: false, status: 401, error: 'Giriş yapmalısınız.' };
  if (user.role !== 'competitor') {
    return { ok: false, status: 403, error: 'Yalnızca yarışmacılar rapor yükleyebilir.' };
  }

  const { data: memberships, error } = await supabaseAdmin()
    .from('team_members')
    .select('team_id, teams(id, competition_id)')
    .eq('user_id', user.id);

  if (error || !memberships?.length) {
    return { ok: false, status: 409, error: 'Kullanıcı bir takıma bağlı değil' };
  }
  const team = memberships[0].teams as unknown as { id: string; competition_id: string };
  return { ok: true, team: { userId: user.id, teamId: team.id, competitionId: team.competition_id } };
}

/** 0002_rls.sql'deki yol kuralı: <team_id>/<uuid>.pdf */
export function storagePathFor(teamId: string): string {
  return `${teamId}/${crypto.randomUUID()}.pdf`;
}

/** Yol gerçekten bu takıma mı ait? İstemci gövdesinden gelen yolu doğrulamak için. */
export function pathBelongsToTeam(path: string, teamId: string): boolean {
  return path.startsWith(`${teamId}/`) && !path.includes('..') && path.endsWith('.pdf');
}
