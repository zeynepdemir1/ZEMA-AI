import type { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * İstemciden gelen `stage_id`'yi doğrular; verilmezse yarışmanın İLK
 * aşamasını döndürür.
 *
 * NEDEN VARSAYILAN VAR: tek aşamalı yarışmalarda kullanıcıya aşama seçimi
 * hiç gösterilmiyor (gereksiz karmaşıklık), dolayısıyla istemci stage_id
 * göndermiyor. Sunucu o durumda tek aşamayı kendisi bulmalı.
 *
 * NEDEN DOĞRULAMA VAR: istemciden gelen kimliğe güvenilmiyor — başka
 * yarışmanın aşamasına yazmak mümkün olmamalı. Bileşik FK (0010) veriyi
 * zaten koruyor ama hata mesajı ham FK ihlali değil, anlaşılır olmalı.
 */
export async function resolveStage(
  db: ReturnType<typeof supabaseAdmin>,
  competitionId: string,
  stageId: unknown,
): Promise<{ id: string; name: string; template_spec: Record<string, unknown> } | null> {
  const wanted = typeof stageId === 'string' ? stageId.trim() : '';

  if (wanted) {
    const { data } = await db
      .from('report_stages')
      .select('id, name, template_spec')
      .eq('id', wanted)
      // Aşama GERÇEKTEN bu yarışmanın mı?
      .eq('competition_id', competitionId)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      template_spec: (data.template_spec ?? {}) as Record<string, unknown>,
    };
  }

  const { data } = await db
    .from('report_stages')
    .select('id, name, template_spec')
    .eq('competition_id', competitionId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    template_spec: (data.template_spec ?? {}) as Record<string, unknown>,
  };
}
