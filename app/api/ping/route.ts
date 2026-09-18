import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ping — Supabase projesini uyanık tutmak için hafif bir "dokunma".
 *
 * NEDEN GEREKLİ: ücretsiz katmanda bir Supabase projesi bir süre trafik
 * almazsa duraklatılıyor (pause). Bu uç harici bir cron/uptime servisinin
 * (ör. cron-job.org, UptimeRobot) düzenli çağırabileceği, minimum maliyetli
 * bir yoklama — middleware.ts'te PUBLIC listesine eklendi ki oturumsuz
 * çağrı /auth'a yönlenmesin.
 *
 * ANAHTAR: yalnızca publishable (anon) anahtar kullanılır — supabaseAdmin()
 * (service_role) BİLEREK kullanılmıyor; bu genel/korumasız uca hiçbir gizli
 * anahtar bulaşmıyor. Zaten NEXT_PUBLIC_SUPABASE_ANON_KEY tarayıcıya da
 * gidiyor, yani "gizli" değil.
 *
 * TABLO SEÇİMİ: `competitions` — şemadaki en küçük tablo (bkz.
 * supabase/migrations/0011_competition_published.sql yorumu: "mevcut 3
 * gerçek yarışma").
 *
 * ⚠️ NOT: supabase/migrations/0002_rls.sql ve 0011_competition_published.sql
 * incelendiğinde public şemadaki HİÇBİR `select` politikası `anon` rolüne
 * tanımlı değil — hepsi `to authenticated`. Yani bu sorgu anon anahtarla
 * satır DÖNDÜRMEZ (RLS boş sonuç verir, hata değil); ama Postgres'e gerçek
 * bir bağlantı + sorgu çalıştırdığı için projeyi uyanık tutmaya yetiyor, ve
 * anon rolünün RLS'i baypas edememesi sayesinde bu uç hiçbir veriyi sızdırma
 * riski taşımıyor.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ ok: false, t: new Date().toISOString() }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from('competitions').select('id').limit(1);

return Response.json({
  ok: !error,
  code: error?.code ?? null,
  msg: error?.message ?? null,
  t: new Date().toISOString()
})
}
