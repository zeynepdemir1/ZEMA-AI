'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Takım adı: harf, rakam, tire ve alt çizgi. Türkçe harfler dahil olsun diye
 * a-z değil Unicode harf sınıfı (\p{L}) kullanılıyor — "GARO_2026" kadar
 * "Çağrı-Takımı" da geçerli olmalı.
 *
 * ⚠️ BOŞLUK KABUL EDİLMİYOR (istenen kural buydu). Gerçek takım adları
 * çoğu zaman boşuk içerir ("Roket Takımı"); gerekirse aşağıdaki sınıfa
 * boşluk eklemek yeterli.
 */
/**
 * `founded_year` kolonu yok mu? (0008 migration'ı çalıştırılmamış)
 *
 * İki farklı hata biçimi geliyor ve ikisi de yakalanmalı:
 *   · Postgres     → code 42703 ("column does not exist")
 *   · PostgREST    → code PGRST204 ("Could not find the column ... in the
 *                    schema cache") — şema önbelleği kolonu hiç görmemişse
 *                    istek Postgres'e ULAŞMADAN reddediliyor.
 * İlk sürüm yalnızca 42703'e bakıyordu ve gerçek hata PGRST204 çıktı.
 */
function isMissingFoundedYear(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /founded_year/.test(error.message ?? '')
  );
}

const TEAM_NAME = /^[\p{L}\p{N}_-]+$/u;
const NAME_MIN = 3;
const NAME_MAX = 50;
/** 1900 öncesi bir yıl veri girişi hatasıdır. */
const YEAR_MIN = 1900;

/**
 * Yarışmacının, takımı olmayan bir yarışmada takım oluşturması.
 *
 * NEDEN AÇIK FORM: önceki sürüm yükleme sırasında arka planda sessizce takım
 * açıyordu. Kullanıcının adına, onayı olmadan bir kayıt yaratmak — hem de
 * adını kendisi seçmeden — doğru değil. Artık kullanıcı formu doldurup
 * onaylıyor; denetim kaydındaki `team_created` mantığı aynen duruyor.
 *
 * service_role kullanılıyor (teams_write_admin politikası takım yazmayı
 * yöneticiye kısıtlıyor). Yetki burada kontrol ediliyor: rol = competitor,
 * ve açılan takım YALNIZCA çağıran kullanıcıya bağlanıyor.
 */
export async function createTeam(input: {
  competitionId: string;
  name: string;
  foundedYear: number;
}): Promise<{ ok: boolean; error?: string; teamId?: string }> {
  if (!input.competitionId || !UUID.test(input.competitionId)) {
    return { ok: false, error: 'Geçersiz yarışma kimliği.' };
  }
  const auth = await authorize(['competitor']);
  if ('error' in auth) return { ok: false, error: auth.error };

  const name = input.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, error: `Takım adı ${NAME_MIN}-${NAME_MAX} karakter olmalı.` };
  }
  if (!TEAM_NAME.test(name)) {
    return {
      ok: false,
      error: 'Takım adı yalnızca harf, rakam, tire ve alt çizgi içerebilir (boşluk olmaz).',
    };
  }

  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(input.foundedYear)) {
    return { ok: false, error: 'Kuruluş yılı zorunlu.' };
  }
  if (input.foundedYear > thisYear) {
    return { ok: false, error: `Kuruluş yılı ${thisYear} yılından büyük olamaz.` };
  }
  if (input.foundedYear < YEAR_MIN) {
    return { ok: false, error: `Kuruluş yılı ${YEAR_MIN} yılından küçük olamaz.` };
  }

  const db = supabaseAdmin();

  // service_role RLS'i baypas ediyor — is_published kontrolü BURADA elle
  // yapılmalı (0011). Aksi halde bir yarışmacı, henüz yayımlanmamış bir
  // yarışmanın kimliğini bir şekilde ele geçirirse (örn. eski bir link)
  // o yarışmaya takım kurup girebilirdi.
  const { data: comp } = await db
    .from('competitions')
    .select('id, is_published')
    .eq('id', input.competitionId)
    .maybeSingle();
  if (!comp) return { ok: false, error: 'Yarışma bulunamadı.' };
  if (!comp.is_published) {
    return { ok: false, error: 'Bu yarışma henüz yayımlanmadı.' };
  }

  /**
   * KATILIM KURALI (katman 2) — bir kullanıcı, bir yarışmada tek takım.
   *
   * Bir kişi farklı bir takım kurarak aynı yarışmaya ikinci kez giremez.
   * Önceki sürüm bu durumda sessizce mevcut takımı döndürüyordu; artık
   * açık hata veriyor, çünkü kullanıcı "yeni takım kurdum" sanıp neden
   * eski takımın raporlarını gördüğünü anlamıyordu.
   */
  const { data: mine } = await db
    .from('team_members')
    .select('team_id, teams(id, name, competition_id)')
    .eq('user_id', auth.user.id);
  const already = (mine ?? [])
    .map((m) => m.teams as unknown as { id: string; name: string; competition_id: string })
    .find((t) => t?.competition_id === input.competitionId);
  if (already) {
    return {
      ok: false,
      error: `Bu yarışmaya zaten "${already.name}" takımı ile katıldınız. Bir kullanıcı, bir yarışmada yalnızca tek bir takımın üyesi olabilir.`,
    };
  }

  const { data: dup } = await db
    .from('teams')
    .select('id')
    .eq('competition_id', input.competitionId)
    .eq('name', name)
    .maybeSingle();
  if (dup) return { ok: false, error: 'Bu yarışmada aynı adda bir takım zaten var.' };

  // 0008 çalıştırılmadıysa founded_year kolonu yok — kolonsuz tekrar dene.
  // (0006/0007'deki "kolon yokluğunu yakala" deseninin aynısı: migration
  // koşulmadan özellik tamamen kırılmasın. Hata biçimi için
  // isMissingFoundedYear'a bak — PostgREST 42703 değil PGRST204 dönüyor.)
  let created: { id: string } | null = null;
  const full = await db
    .from('teams')
    .insert({ competition_id: input.competitionId, name, founded_year: input.foundedYear })
    .select('id')
    .single();
  if (isMissingFoundedYear(full.error)) {
    const fallback = await db
      .from('teams')
      .insert({ competition_id: input.competitionId, name })
      .select('id')
      .single();
    if (fallback.error) return { ok: false, error: `Takım oluşturulamadı: ${fallback.error.message}` };
    created = fallback.data;
  } else if (full.error) {
    return { ok: false, error: `Takım oluşturulamadı: ${full.error.message}` };
  } else {
    created = full.data;
  }

  const { error: me } = await db
    .from('team_members')
    .insert({ team_id: created!.id, user_id: auth.user.id });
  if (me) {
    await db.from('teams').delete().eq('id', created!.id); // yetim takım bırakma
    return { ok: false, error: `Takıma eklenemedi: ${me.message}` };
  }

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'team.created',
    entity: 'teams',
    entity_id: created!.id,
    meta: { name, founded_year: input.foundedYear, competition_id: input.competitionId },
  });

  revalidatePath('/submissions/new');
  revalidatePath('/submissions');
  return { ok: true, teamId: created!.id };
}
