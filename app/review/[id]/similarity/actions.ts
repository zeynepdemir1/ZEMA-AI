'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { assertReportAccess, authorize } from '@/lib/supabase/server';

/** §4.4: hakem HER eşleşmeyi bağımsız değerlendirir. */
export async function setPairVerdict(
  reportId: string,
  pairId: string,
  verdict: 'pending' | 'confirmed' | 'false_positive',
): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorize(['judge']);
  if ('error' in auth) return { ok: false, error: auth.error };
  const denied = await assertReportAccess(auth.user, reportId);
  if (denied) return { ok: false, error: denied };

  const db = supabaseAdmin();
  const { error } = await db
    .from('similarity_pairs')
    .update({ judge_verdict: verdict })
    .eq('id', pairId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/review/${reportId}/similarity`);
  return { ok: true };
}
