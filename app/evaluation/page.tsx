import Link from 'next/link';
import { loadDashboard } from '@/lib/reports/queries';

import { requireRole } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BADGE: Record<string, string> = {
  gold: 'text-gold-ink border-gold',
  teal: 'text-teal-ink border-teal',
  muted: 'text-ink/75 border-ink/[.45]',
  danger: 'text-danger border-danger',
};
const BAR: Record<string, string> = {
  gold: '#C98A3E',
  teal: '#1B2A4A',
  muted: '#1B2A4A',
  danger: '#B4483F',
};

export default async function EvaluationDashboard() {
  await requireRole(['evaluation_admin','competition_admin']);
  const data = await loadDashboard();

  if (!data) {
    return (
      <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
        <div className="border-ink/[.22] mx-auto max-w-[680px] border border-dashed bg-white p-10 text-center">
          <div className="font-heading mb-2 text-[18px] font-semibold">Tanımlı yarışma yok</div>
          <div className="text-ink/75 text-[13.5px]">
            <span className="font-mono">npm run seed</span> çalıştırılmalı.
          </div>
        </div>
      </div>
    );
  }

  const { competition, stats, queue, workload, updatedAt } = data;
  const cards = [
    { label: 'TOPLAM RAPOR', value: stats.totalReports, tone: 'text-ink', note: `${queue.length} kayıt` },
    { label: 'AI ANALİZİ TAMAM', value: stats.analyzed, tone: 'text-teal-ink', note: `${stats.totalReports - stats.analyzed} rapor kuyrukta` },
    { label: 'HAKEM ONAYI BEKLEYEN', value: stats.awaitingApproval, tone: 'text-gold-ink', note: 'Kriter onayı eksik' },
    { label: 'YAYINLANAN SONUÇ', value: stats.published, tone: 'text-success', note: 'Yarışmacılara iletildi' },
  ];

  return (
    <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-[26px] flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-ink/75 mb-2 font-mono text-[10.5px] tracking-[.14em]">
              DEĞERLENDİRME YÖNETİCİSİ
            </div>
            <h2 className="font-heading m-0 text-[28px] font-semibold">
              {competition.name} · {competition.year}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href="/evaluation/assignments"
              className="border-ink/[.22] text-ink cursor-pointer border px-4 py-2 font-sans text-[13px] no-underline"
            >
              Hakem ataması →
            </Link>
            <div className="text-ink/75 font-mono text-[11px]">
            {updatedAt
              ? `SON HAREKET ${new Date(updatedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`
              : 'HAREKET YOK'}
            </div>
          </div>
        </div>

        <div className="mb-[22px] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((s) => (
            <div key={s.label} className="border-ink/10 border bg-white px-[22px] pt-[22px] pb-6">
              <div className="text-ink/75 mb-[14px] font-mono text-[10px] tracking-[.12em]">
                {s.label}
              </div>
              <div className={`font-mono text-[34px] leading-none ${s.tone}`}>{s.value}</div>
              <div className="text-ink/75 mt-2.5 text-[12.5px]">{s.note}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.4fr_.6fr]">
          <div className="border-ink/10 border bg-white px-[26px] pt-6 pb-[26px]">
            <div className="text-ink/75 mb-[18px] font-mono text-[10.5px] tracking-[.14em]">
              İŞ KUYRUĞU
            </div>

            {queue.length === 0 ? (
              <div className="text-ink/75 py-6 text-center text-[13.5px]">
                Henüz rapor yüklenmedi.
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <div
                  className="border-ink/[.12] text-ink/75 grid gap-4 border-b pb-2.5 font-mono text-[10px] tracking-[.1em]"
                  style={{ gridTemplateColumns: '1.6fr .9fr 1.2fr .7fr' }}
                >
                  <span>TAKIM</span><span>HAKEM</span><span>KONTROL</span><span>DURUM</span>
                </div>
                {queue.map((q) => (
                  <div
                    key={q.reportId}
                    className="border-ink/[.07] grid items-center gap-4 border-b py-[13px]"
                    style={{ gridTemplateColumns: '1.6fr .9fr 1.2fr .7fr' }}
                  >
                    <div>
                      <Link
                        href={`/review/${q.reportId}`}
                        className="text-ink text-[13.5px] font-medium no-underline hover:underline"
                      >
                        {q.team}
                      </Link>
                      <div className="text-ink/75 mt-0.5 font-mono text-[10.5px]">{q.code}</div>
                    </div>
                    <div className={`text-[13px] ${q.judge === 'Atanmadı' ? 'text-danger' : 'text-ink/75'}`}>
                      {q.judge}
                    </div>
                    <div>
                      <div className="bg-ink/[.09] mb-1.5 h-[5px]">
                        <div
                          className="h-[5px]"
                          style={{
                            width: `${q.checksTotal ? (q.checksDone / q.checksTotal) * 100 : 0}%`,
                            background: BAR[q.tone],
                          }}
                        />
                      </div>
                      <div className="text-ink/75 font-mono text-[10.5px]">
                        {q.checksDone}/{q.checksTotal} KONTROL · {q.approved}/{q.total || 6} ONAY
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-1.5">
                      <span
                        className={`border px-[7px] py-[3px] font-mono text-[9.5px] tracking-[.1em] ${BADGE[q.tone]}`}
                      >
                        {q.badge}
                      </span>
                      <Link
                        href={`/evaluation/feedback/${q.reportId}`}
                        className="text-t3-blue-ink text-[11.5px] no-underline hover:underline"
                      >
                        geri bildirim →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-ink/10 border bg-white px-[26px] pt-6 pb-[26px]">
            <div className="text-ink/75 mb-[18px] font-mono text-[10.5px] tracking-[.14em]">
              HAKEM İŞ YÜKÜ
            </div>
            {workload.length === 0 ? (
              <div className="text-ink/75 text-[13px]">Kayıtlı hakem yok.</div>
            ) : (
              <div className="flex flex-col gap-4">
                {workload.map((w) => (
                  <div key={w.name}>
                    <div className="mb-[7px] flex items-baseline justify-between">
                      <span className="text-[13.5px]">{w.name}</span>
                      <span className="text-ink/75 font-mono text-[11.5px]">
                        {w.assigned} / {w.capacity}
                      </span>
                    </div>
                    <div className="bg-ink/[.09] h-[5px]">
                      <div
                        className="bg-ink h-[5px]"
                        style={{ width: `${(w.assigned / w.capacity) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="border-ink/[.08] text-ink/75 mt-[22px] border-t pt-4 text-[12.5px] leading-[1.6]">
              {workload.every((w) => w.assigned === 0) ? (
                <>
                  <span className="text-danger">Hiçbir rapor hakeme atanmadı.</span> Atama ekranı
                  henüz yok; raporlar şimdilik doğrudan açılabiliyor.
                </>
              ) : (
                'Atama dağılımı yukarıda.'
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
