'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';

/** §4.4: hakem HER eşleşmeyi bağımsız değerlendirir. */
export async function setPairVerdict(
  reportId: string,
  pairId: string,
  verdict: 'pending' | 'confirmed' | 'false_positive',
): Promise<{ ok: boolean; error?: string }> {
  const db = supabaseAdmin();
  const { error } = await db
    .from('similarity_pairs')
    .update({ judge_verdict: verdict })
    .eq('id', pairId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/review/${reportId}/similarity`);
  return { ok: true };
}
