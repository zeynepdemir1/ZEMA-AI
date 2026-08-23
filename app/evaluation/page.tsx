import { DASH_QUEUE, DASH_STATS, DASH_WORKLOAD } from '@/lib/design/mock-data';

const TONE_TEXT = {
  ink: 'text-ink',
  teal: 'text-teal',
  gold: 'text-gold',
  success: 'text-success',
} as const;

const BADGE_TONE = {
  gold: 'text-gold border-gold',
  teal: 'text-teal border-teal',
  muted: 'text-ink/[.45] border-ink/[.45]',
  danger: 'text-danger border-danger',
} as const;

const BAR_COLOR = {
  gold: '#C98A3E',
  teal: '#1B2A4A',
  muted: '#1B2A4A',
  danger: '#B4483F',
} as const;

export default function EvaluationDashboard() {
  return (
    <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-[26px] flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-ink/50 mb-2 font-mono text-[10.5px] tracking-[.14em]">
              DEĞERLENDİRME YÖNETİCİSİ
            </div>
            <h2 className="font-heading m-0 text-[28px] font-semibold">
              İnsansız Hava Araçları · Ön Tasarım Raporu
            </h2>
          </div>
          <div className="text-ink/50 font-mono text-[11px]">SON GÜNCELLEME 14.03.2026 · 11:42</div>
        </div>

        <div className="mb-[22px] grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DASH_STATS.map((s) => (
            <div key={s.label} className="border-ink/10 border bg-white px-[22px] pt-[22px] pb-6">
              <div className="text-ink/50 mb-[14px] font-mono text-[10px] tracking-[.12em]">
                {s.label}
              </div>
              <div className={`font-mono text-[34px] leading-none ${TONE_TEXT[s.tone]}`}>
                {s.value}
              </div>
              <div className="text-ink/[.58] mt-2.5 text-[12.5px]">{s.note}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.4fr_.6fr]">
          {/* İş kuyruğu */}
          <div className="border-ink/10 border bg-white px-[26px] pt-6 pb-[26px]">
            <div className="text-ink/50 mb-[18px] font-mono text-[10.5px] tracking-[.14em]">
              İŞ KUYRUĞU
            </div>
            <div className="flex flex-col gap-0.5">
              <div
                className="border-ink/[.12] text-ink/50 grid gap-4 border-b pb-2.5 font-mono text-[10px] tracking-[.1em]"
                style={{ gridTemplateColumns: '1.6fr .9fr 1.2fr .7fr' }}
              >
                <span>TAKIM</span>
                <span>HAKEM</span>
                <span>KONTROL</span>
                <span>DURUM</span>
              </div>
              {DASH_QUEUE.map((q) => (
                <div
                  key={q.code}
                  className="border-ink/[.07] grid items-center gap-4 border-b py-[13px]"
                  style={{ gridTemplateColumns: '1.6fr .9fr 1.2fr .7fr' }}
                >
                  <div>
                    <div className="text-[13.5px] font-medium">{q.team}</div>
                    <div className="text-ink/[.45] mt-0.5 font-mono text-[10.5px]">{q.code}</div>
                  </div>
                  <div className="text-ink/70 text-[13px]">{q.judge}</div>
                  <div>
                    <div className="bg-ink/[.09] mb-1.5 h-[5px]">
                      <div
                        className="h-[5px]"
                        style={{ width: `${q.pct}%`, background: BAR_COLOR[q.tone] }}
                      />
                    </div>
                    <div className="text-ink/[.55] font-mono text-[10.5px]">
                      {q.progress} KONTROL
                    </div>
                  </div>
                  <span
                    className={`justify-self-start border px-[7px] py-[3px] font-mono text-[9.5px] tracking-[.1em] ${BADGE_TONE[q.tone]}`}
                  >
                    {q.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Hakem iş yükü */}
          <div className="border-ink/10 border bg-white px-[26px] pt-6 pb-[26px]">
            <div className="text-ink/50 mb-[18px] font-mono text-[10.5px] tracking-[.14em]">
              HAKEM İŞ YÜKÜ
            </div>
            <div className="flex flex-col gap-4">
              {DASH_WORKLOAD.map((w) => (
                <div key={w.name}>
                  <div className="mb-[7px] flex items-baseline justify-between">
                    <span className="text-[13.5px]">{w.name}</span>
                    <span className="text-ink/60 font-mono text-[11.5px]">{w.count}</span>
                  </div>
                  <div className="bg-ink/[.09] h-[5px]">
                    <div className="bg-ink h-[5px]" style={{ width: `${w.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-ink/[.08] text-ink/[.62] mt-[22px] border-t pt-4 text-[12.5px] leading-[1.6]">
              Ortalama onay süresi <span className="text-ink font-mono">11 dk</span> — AI taslağı
              olmadan ölçülen süre 34 dk idi.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
