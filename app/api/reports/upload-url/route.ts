import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveStage } from '@/lib/reports/stage-resolve';
import {
  alreadyEnteredMessage,
  findExistingEntry,
  resolveUploaderTeam,
  storagePathFor,
} from '@/lib/reports/upload';

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
export async function POST(req: Request) {
  // Yarışma kimliği gövdeden geliyor: imzalı URL'nin yolu SEÇİLEN yarışmadaki
  // takımın klasörü olmalı, kullanıcının rastgele ilk takımının değil.
  const body = (await req.json().catch(() => null)) as {
    competition_id?: unknown;
    stage_id?: unknown;
  } | null;
  const competitionId = String(body?.competition_id ?? '').trim() || undefined;
  const resolved = await resolveUploaderTeam(competitionId);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  // Katılım kuralı AŞAMA düzeyinde (0010) — BURADA da kontrol ediliyor,
  // yoksa kullanıcı dosyayı Storage'a yükleyip ancak sonraki adımda
  // reddediliyordu.
  const db = supabaseAdmin();
  const stage = await resolveStage(db, resolved.team.competitionId, body?.stage_id);
  if (!stage) {
    return NextResponse.json({ error: 'Bu yarışmada rapor aşaması bulunamadı.' }, { status: 404 });
  }
  const already = await findExistingEntry(resolved.team.teamId, stage.id);
  if (already) {
    return NextResponse.json(
      { error: alreadyEnteredMessage(already.title, stage.name) },
      { status: 409 },
    );
  }

  const path = storagePathFor(resolved.team.teamId);
  const { data, error } = await db.storage.from('reports').createSignedUploadUrl(path);
  if (error) {
    return NextResponse.json({ error: `Yükleme adresi alınamadı: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ path: data.path, token: data.token });
}
