import { NextResponse } from 'next/server';
import { ApiError } from '@google/genai';
import { apiKeys, genai, keyLabel } from '@/lib/ai/client';
import { MOCK_AI, MODEL_CHAIN } from '@/lib/ai/config';
import { authorize } from '@/lib/supabase/server';

/**
 * GET /api/diagnostics/keys — anahtar havuzunun SAĞLIK KONTROLÜ.
 *
 * NEDEN GEREKLİ: Vercel ortam değişkenlerinin DEĞERLERİ panelde
 * görüntülenemiyor (Vercel gösterimi kapatıyor). Ad listesi doğru olsa bile
 * değerin geçerli bir anahtar olup olmadığı dışarıdan bilinemez — ve bunu
 * demo günü `MOCK_AI=false` yapıldığında öğrenmek çok geç olur.
 *
 * Bu uç, çağrıyı SUNUCUNUN KENDİSİNE yaptırır: yani Vercel'in gerçekten
 * sahip olduğu anahtarlarla konuşur.
 *
 * KOTA HARCAMAZ. `models.list()` bir metadata çağrısıdır; günlük 20
 * istek/model/proje üretim kotasından hiçbir şey düşmez.
 *
 * GİZLİLİK: anahtar DEĞERİ asla döndürülmez — ne tamamı ne bir parçası ne
 * de karması. Yalnızca sıra numarası ("anahtar #2"), geçerli olup olmadığı
 * ve zincirdeki hangi modellere eriştiği bildirilir.
 *
 * YETKİ: yalnızca Yarışma Yöneticisi. Uç, harici bir servise istek
 * yaptırdığı için açık bırakılamaz.
 */
export async function GET() {
  const auth = await authorize(['competition_admin']);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: 403 });

  const keys = apiKeys();

  const results = await Promise.all(
    keys.map(async (_k, i) => {
      try {
        const page = await genai(i).models.list();
        const names: string[] = [];
        for await (const m of page) names.push(String(m.name).replace('models/', ''));
        const reachable = MODEL_CHAIN.filter((m) => names.includes(m));
        return {
          key: keyLabel(i),
          ok: true as const,
          models_total: names.length,
          chain_reachable: reachable,
          chain_missing: MODEL_CHAIN.filter((m) => !names.includes(m)),
        };
      } catch (e) {
        const status = e instanceof ApiError ? e.status : undefined;
        const raw = e instanceof Error ? e.message : String(e);
        return {
          key: keyLabel(i),
          ok: false as const,
          status,
          // Google'ın hata gövdesi anahtar değeri içermiyor; yine de
          // kısaltıyoruz ki beklenmedik bir içerik uzun uzun yansımasın.
          error: raw.slice(0, 200),
        };
      }
    }),
  );

  const healthy = results.filter((r) => r.ok).length;

  return NextResponse.json({
    mock_ai: MOCK_AI,
    keys_found: keys.length,
    keys_healthy: healthy,
    model_chain: MODEL_CHAIN,
    // Ücretsiz katman: proje × model başına günde 20 istek.
    daily_capacity: healthy * MODEL_CHAIN.length * 20,
    results,
    note:
      'models.list() metadata çağrısıdır — üretim kotası harcanmaz. ' +
      'Anahtar değerleri hiçbir biçimde döndürülmez.',
  });
}
