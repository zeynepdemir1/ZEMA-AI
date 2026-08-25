import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/supabase/server';
import { rulebookStoragePath, UUID_RE } from '@/lib/reports/template';

/**
 * POST /api/competitions/[id]/rulebook-url
 *
 * Şartname PDF'ini doğrudan Storage'a yüklemek için imzalı URL üretir —
 * şablon yüklemedeki aynı sebep: Vercel serverless fonksiyonların istek
 * gövdesi 4,5 MB ile sınırlı ve şartnameler şablonlardan büyük olabiliyor.
 *
 * Yol `_specs/<competition_id>/<uuid>.pdf`; önek yarışmacılara kapalı.
 */
export async function POST(_req: Request, ctx: RouteContext<'/api/competitions/[id]/rulebook-url'>) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Geçersiz yarışma kimliği.' }, { status: 400 });
  }
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 403 });

  const path = rulebookStoragePath(id);
  const { data, error } = await supabaseAdmin()
    .storage.from('reports')
    .createSignedUploadUrl(path);
  if (error) {
    return NextResponse.json({ error: `Yükleme adresi alınamadı: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}
