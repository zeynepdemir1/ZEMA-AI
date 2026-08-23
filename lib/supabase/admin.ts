import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * service_role istemcisi — RLS'i BAYPAS EDER.
 *
 * ⚠️ Yalnızca sunucu tarafı. Bir client component'ten import edilirse
 * SUPABASE_SERVICE_ROLE_KEY tarayıcı paketine girer ve tüm veri açığa çıkar.
 *
 * Kullanım alanları (PLAN.md):
 * - §2.1 job runner (`/api/jobs/tick`) — analiz sonuçlarını yazar
 * - §3.2 kayıt endpoint'i — rol ataması yapar
 * - seed betikleri
 */
let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!cached) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY tanımlı olmalı (sunucu tarafı).',
      );
    }
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
