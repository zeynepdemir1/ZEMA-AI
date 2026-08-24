import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { authorize } from '@/lib/supabase/server';
import { templateStoragePath, UUID_RE } from '@/lib/reports/template';

/**
 * POST /api/competitions/[id]/template-url
 *
 * Yarışma Yöneticisi'nin şablon PDF'ini doğrudan Storage'a yüklemesi için
 * imzalı URL üretir (rapor yüklemedeki aynı sebep: Vercel fonksiyon gövdesi
 * 4,5 MB ile sınırlı).
 *
 * Yol `_templates/<competition_id>/<uuid>.pdf`. Bu önek yarışmacılara KAPALI:
 * 0002_rls.sql'deki depo politikaları ilk klasör adının UUID olmasını ve
 * kullanıcının o takımın üyesi olmasını şart koşuyor; "_templates" UUID
 * regex'ini geçmiyor. Personel (auth_is_staff) okuyabiliyor — şablon zaten
 * personel belgesi.
 */
export async function POST(_req: Request, ctx: RouteContext<'/api/competitions/[id]/template-url'>) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Geçersiz yarışma kimliği.' }, { status: 400 });
  }
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 403 });

  const path = templateStoragePath(id);
  const { data, error } = await supabaseAdmin()
    .storage.from('reports')
    .createSignedUploadUrl(path);
  if (error) {
    return NextResponse.json({ error: `Yükleme adresi alınamadı: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}
