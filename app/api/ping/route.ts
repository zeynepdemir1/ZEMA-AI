import { supabaseAdmin } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ping — Supabase projesini uyanık tutmak için gerçek bir YAZMA.
 *
 * NEDEN GEREKLİ: ücretsiz katmanda bir Supabase projesi bir süre trafik
 * almazsa duraklatılıyor (pause). Bu uç harici bir cron/uptime servisinin
 * (ör. cron-job.org) düzenli çağırabileceği bir yoklama — middleware.ts'te
 * PUBLIC listesine eklendi ki oturumsuz çağrı /auth'a yönlenmesin.
 *
 * ANAHTAR: service_role kullanılır (supabaseAdmin()) — SELECT'in aksine
 * upsert RLS'i baypas etmeden `authenticated`/`anon` ile çalışmaz, çünkü
 * `keepalive` tablosunda oturumsuz bir yazma politikası yok ve olmamalı.
 * Anahtar yalnızca sunucu tarafında kullanılır, response'a hiçbir zaman
 * yazılmaz.
 *
 * TABLO: `public.keepalive` — supabase/migrations/0017_keepalive.sql ile
 * repo'da tanımlı (tablo veritabanında elle açıldı, migration uygulanmadı).
 */
export async function GET() {
  const t = new Date().toISOString();

  try {
    const { error } = await supabaseAdmin()
      .from('keepalive')
      .upsert({ id: 1, last_ping: t });

    if (error) {
      console.error('[api/ping] keepalive upsert başarısız:', error.message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true, t });
  } catch (err) {
    console.error('[api/ping] beklenmeyen hata:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
