import { notFound } from 'next/navigation';
import { ReviewSidebar } from '@/components/zema/review-sidebar';
import {
  DEFAULT_SIMILARITY_THRESHOLD,
  MATCHES,
  findReport,
} from '@/lib/design/mock-data';
import { ReviewPanel } from './review-panel';

export default async function ReviewPage({ params }: PageProps<'/review/[id]'>) {
  const { id } = await params;
  const report = findReport(id);
  if (!report) notFound();

  const matches = MATCHES[report.code] ?? [];
  const maxPct = matches.reduce((a, m) => Math.max(a, m.pct), 0);

  return (
    <div className="grid min-h-screen flex-1 grid-cols-1 lg:grid-cols-[288px_1fr]">
      <div className="hidden lg:flex lg:flex-col">
        <ReviewSidebar activeCode={report.code} />
      </div>
      <ReviewPanel
        report={report}
        matchCount={matches.length}
        maxPct={maxPct}
        threshold={DEFAULT_SIMILARITY_THRESHOLD}
      />
    </div>
  );
}
