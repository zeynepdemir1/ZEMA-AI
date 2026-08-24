import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveUploaderTeam, storagePathFor } from '@/lib/reports/upload';

/**
 * POST /api/reports/upload-url — tarayıcının doğrudan Storage'a yazması için
 * tek kullanımlık imzalı URL üretir.
 *
 * Neden: PDF'i kendi fonksiyonumuzdan geçirmek Vercel'in 4,5 MB istek gövdesi
 * sınırına takılıyor. Dosya buradan alınan URL ile doğrudan Supabase'e gidiyor.
 *
 * GÜVENLİK: yol adı istemciden ALINMIYOR, oturumun takımından türetiliyor.
 * Böylece imzalı URL yalnızca o takımın klasörüne yazabilir.
 */
export async function POST() {
  const resolved = await resolveUploaderTeam();
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const path = storagePathFor(resolved.team.teamId);
  const { data, error } = await supabaseAdmin().storage.from('reports').createSignedUploadUrl(path);
  if (error) {
    return NextResponse.json({ error: `Yükleme adresi alınamadı: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}
