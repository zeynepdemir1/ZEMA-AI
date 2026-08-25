import { notFound } from 'next/navigation';
import { ReviewSidebar } from '@/components/zema/review-sidebar';
import { loadReview, loadSidebarReports, loadSimilarity } from '@/lib/reports/queries';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ROLE_LABEL } from '@/lib/supabase/server';
import { ReviewPanel } from './review-panel';

// Hakem düzenlemeleri anında görünmeli — önbelleğe alma.
import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: PageProps<'/review/[id]'>) {
  const user = await requireRole(['judge', 'evaluation_admin', 'competition_admin']);
  const { id } = await params;
  const [data, similarity] = await Promise.all([loadReview(id), loadSimilarity(id)]);
  if (!data) notFound();

  const { data: report } = await supabaseAdmin()
    .from('reports')
    .select('competition_id')
    .eq('id', id)
    .single();
  const sidebar = await loadSidebarReports(report!.competition_id);

  return (
    <div className="grid min-h-screen flex-1 grid-cols-1 lg:grid-cols-[288px_1fr]">
      <div className="hidden lg:flex lg:flex-col">
        <ReviewSidebar
          activeId={id}
          reports={sidebar}
          user={{ name: user.fullName ?? (user.email ?? '—'), roleLabel: ROLE_LABEL[user.role] }}
        />
      </div>
      <ReviewPanel data={data} similarityMatches={similarity?.matches ?? []} />
    </div>
  );
}
