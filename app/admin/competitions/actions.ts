'use server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server action argümanları istemciden gelir; kimlikleri süzmeden kullanma. */
function badId(...ids: Array<string | undefined | null>): string | null {
  return ids.some((id) => !id || !UUID.test(id)) ? 'Geçersiz kimlik.' : null;
}

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/supabase/server';

/**
 * YENİ yarışma oluşturur — mevcut tek satırı GÜNCELLEMEZ.
 *
 * Bunun eksikliği gerçek bir kafa karışıklığına yol açtı: "Yarışma
 * Bilgileri" formu (saveCompetitionInfo) var olan satırı yerinde
 * düzenliyor; bir kullanıcı oraya yeni ad/yıl yazdığında yeni bir yarışma
 * sandı, ama demo yarışmasının kimliği üzerine yazıldı — kategoriler ona
 * bağlı kaldığı için "eski kategoriler yeni yarışmada görünüyor" gibi
 * göründü. Bu action gerçekten YENİ bir satır açıyor; kategorileri/
 * kriterleri boş, kendi template_spec'i boş.
 */
export async function createCompetition(input: {
  name: string;
  year: number;
  language: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return { ok: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Yarışma adı zorunlu.' };
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    return { ok: false, error: 'Geçersiz yıl.' };
  }
  const language = input.language.trim() || 'tr';

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('competitions')
    .insert({
      name,
      year: input.year,
      language,
      created_by: auth.user.id,
      similarity_threshold: 50,
      template_spec: {},
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'competition.created',
    entity: 'competitions',
    entity_id: data.id,
    meta: { name, year: input.year, language },
  });
  revalidatePath('/admin/competitions');
  return { ok: true, id: data.id };
}

/**
 * Kategori CRUD — Yarışma Bilgileri sekmesi.
 *
 * RLS (0002_rls.sql, categories_write_admin) yazmayı yalnızca
 * competition_admin'e veriyor — PLAN.md §3.1 matrisiyle aynı satır. authorize()
 * burada RLS'in ikinci savunma katmanı: supabaseAdmin() service_role ile RLS'i
 * baypas ediyor, o yüzden rol kontrolü BURADA da yapılmazsa yalnızca RLS'e
 * güvenmiş oluruz — diğer action'larla aynı iki-katmanlı desen korunuyor.
 */
export async function createCategory(
  competitionId: string,
  input: { name: string; description: string },
): Promise<{ ok: boolean; error?: string }> {
  const invalid = badId(competitionId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return { ok: false, error: auth.error };

  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) return { ok: false, error: 'Kategori adı zorunlu.' };
  if (!description) return { ok: false, error: 'Kategori açıklaması zorunlu.' };

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('categories')
    .insert({ competition_id: competitionId, name, description })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'category.created',
    entity: 'categories',
    entity_id: data.id,
    meta: { name },
  });
  revalidatePath('/admin/competitions');
  return { ok: true };
}

export async function updateCategory(
  categoryId: string,
  input: { name: string; description: string },
): Promise<{ ok: boolean; error?: string }> {
  const invalid = badId(categoryId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return { ok: false, error: auth.error };

  const name = input.name.trim();
  const description = input.description.trim();
  if (!name) return { ok: false, error: 'Kategori adı zorunlu.' };
  if (!description) return { ok: false, error: 'Kategori açıklaması zorunlu.' };

  const db = supabaseAdmin();
  const { error } = await db.from('categories').update({ name, description }).eq('id', categoryId);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'category.updated',
    entity: 'categories',
    entity_id: categoryId,
    meta: { name },
  });
  revalidatePath('/admin/competitions');
  return { ok: true };
}

/**
 * Kategori silme — raporu olan bir kategori silinemez.
 *
 * `reports.category_id` `categories(id)`e FK ama `on delete` davranışı
 * belirtilmemiş (varsayılan RESTRICT) — yani veritabanı zaten engelleyip
 * ham bir Postgres hatası döndürürdü. Burada ÖNDEN kontrol edip anlamlı bir
 * Türkçe mesaj veriyoruz; DB kısıtı yine de son savunma hattı olarak duruyor.
 */
export async function deleteCategory(categoryId: string): Promise<{ ok: boolean; error?: string }> {
  const invalid = badId(categoryId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return { ok: false, error: auth.error };

  const db = supabaseAdmin();
  const { count, error: ce } = await db
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', categoryId);
  if (ce) return { ok: false, error: ce.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Bu kategoride ${count} rapor var, silinemez. Önce raporları başka bir kategoriye taşıyın.`,
    };
  }

  const { data: cat } = await db.from('categories').select('name').eq('id', categoryId).maybeSingle();
  const { error } = await db.from('categories').delete().eq('id', categoryId);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'category.deleted',
    entity: 'categories',
    entity_id: categoryId,
    meta: { name: cat?.name ?? null },
  });
  revalidatePath('/admin/competitions');
  return { ok: true };
}

/**
 * Yarışma Bilgileri sekmesi — ad, yıl, dil, son başvuru tarihi.
 *
 * Şablon/kriter/eşik BURADA yok: onlar "Şablon ve Kriterler" sekmesinin işi
 * (bkz. app/admin/competitions/template/page.tsx). Bu action yalnızca
 * competitions tablosunun temel alanlarına dokunuyor.
 */
export async function saveCompetitionInfo(
  competitionId: string,
  input: { name: string; year: number; language: string; submissionDeadline: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const invalid = badId(competitionId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return { ok: false, error: auth.error };

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Yarışma adı zorunlu.' };
  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) {
    return { ok: false, error: 'Geçersiz yıl.' };
  }
  const language = input.language.trim() || 'tr';

  const db = supabaseAdmin();
  const { error } = await db
    .from('competitions')
    .update({
      name,
      year: input.year,
      language,
      submission_deadline: input.submissionDeadline,
    })
    .eq('id', competitionId);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'competition.info_updated',
    entity: 'competitions',
    entity_id: competitionId,
    meta: { name, year: input.year, language, submission_deadline: input.submissionDeadline },
  });
  revalidatePath('/admin/competitions');
  return { ok: true };
}

/**
 * §4.4: similarity_threshold SADECE bir UI filtresi — değiştirmek yeniden
 * analiz TETİKLEMEZ, zaten hesaplanmış similarity_pairs satırları eşiğe göre
 * yorumlanır. Bu yüzden kaydetmek ucuz ve güvenli.
 */
export async function saveSimilarityThreshold(
  competitionId: string,
  value: number,
): Promise<{ ok: boolean; error?: string }> {
  // Yarışma yapılandırması yalnızca Yarışma Yöneticisinde (§3.1).
  const invalid = badId(competitionId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return { ok: false, error: auth.error };

  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return { ok: false, error: 'Eşik 0-100 arası tam sayı olmalı.' };
  }
  const db = supabaseAdmin();
  const { error } = await db
    .from('competitions')
    .update({ similarity_threshold: value })
    .eq('id', competitionId);
  if (error) return { ok: false, error: error.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'competition.threshold_changed',
    entity: 'competitions',
    entity_id: competitionId,
    meta: { similarity_threshold: value },
  });
  revalidatePath('/admin/competitions/template');
  return { ok: true };
}

/**
 * Şablon çıkarımını geri al.
 *
 * AI çıkarımı yanlış olabilir ve yarışma kuralları tek bir model çağrısına
 * emanet edilemez. Çıkarım sırasında eski spec `template_spec.previous`
 * altına yazılıyor; bu action onu geri yükler.
 */
export async function revertTemplateSpec(
  competitionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const invalid = badId(competitionId);
  if (invalid) return { ok: false, error: invalid };
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return { ok: false, error: auth.error };

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('competitions')
    .select('template_spec')
    .eq('id', competitionId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: 'Yarışma bulunamadı.' };

  const spec = data.template_spec as Record<string, unknown> | null;
  const previous = spec?.previous as Record<string, unknown> | null | undefined;
  if (!previous) return { ok: false, error: 'Geri dönülecek önceki şablon yok.' };

  const { error: ue } = await db
    .from('competitions')
    .update({ template_spec: previous })
    .eq('id', competitionId);
  if (ue) return { ok: false, error: ue.message };

  await db.from('audit_log').insert({
    actor: auth.user.id,
    action: 'competition.template_reverted',
    entity: 'competitions',
    entity_id: competitionId,
  });
  revalidatePath('/admin/competitions/template');
  return { ok: true };
}
