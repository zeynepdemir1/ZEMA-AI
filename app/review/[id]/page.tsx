import { notFound } from 'next/navigation';
import { ReviewSidebar } from '@/components/zema/review-sidebar';
import { loadReview, loadSidebarReports } from '@/lib/reports/queries';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ReviewPanel } from './review-panel';

// Hakem düzenlemeleri anında görünmeli — önbelleğe alma.
export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: PageProps<'/review/[id]'>) {
  const { id } = await params;
  const data = await loadReview(id);
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
        <ReviewSidebar activeId={id} reports={sidebar} />
      </div>
      <ReviewPanel data={data} />
    </div>
  );
}
