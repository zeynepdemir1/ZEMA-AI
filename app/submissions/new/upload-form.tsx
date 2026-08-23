'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * PLAN.md §2.1 — analiz kuyruğunun ANA tetikleyicisi burası:
 * yükleme bittikten sonra client `/api/jobs/tick`'i döngüde çağırır.
 * Vercel Cron'a güvenilmiyor (Hobby planında sıklık çok kısıtlı).
 */
const MAX_TICKS = 20;

type Phase = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';

export function UploadForm({ categories }: { categories: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 6 });
  const [reportId, setReportId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('PDF seçmelisiniz.');
    if (!title.trim()) return setError('Rapor başlığı zorunlu.');

    setError(null);
    setPhase('uploading');

    const form = new FormData();
    form.set('file', file);
    form.set('title', title.trim());
    form.set('category_id', categoryId);

    const res = await fetch('/api/reports', { method: 'POST', body: form });
    const body = await res.json();
    if (!res.ok) {
      setPhase('error');
      setError(body.error ?? 'Yükleme başarısız.');
      return;
    }

    setReportId(body.report_id);
    setProgress({ done: 0, total: body.jobs_queued ?? 6 });
    setPhase('analyzing');

    // Kuyruğu döndür — her tick 1-2 iş çalıştırır.
    for (let i = 0; i < MAX_TICKS; i++) {
      const t = await fetch('/api/jobs/tick', { method: 'POST' });
      const td = await t.json().catch(() => ({}));
      if (typeof td.pending === 'number') {
        setProgress((p) => ({ ...p, done: Math.max(0, p.total - td.pending) }));
      }
      if (td.done || td.pending === 0) break;
    }

    setPhase('done');
    router.refresh();
  }

  const busy = phase === 'uploading' || phase === 'analyzing';

  return (
    <form onSubmit={onSubmit} className="border-ink/10 border bg-white p-7">
      <label className="text-ink/60 mb-2 block font-mono text-[10.5px] tracking-[.12em]" htmlFor="title">
        RAPOR BAŞLIĞI
      </label>
      <input
        id="title"
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ön Tasarım Raporu — proje adınız"
        className="border-ink/[.18] text-ink mb-5 w-full border bg-white px-[14px] py-3 font-sans text-[14.5px] disabled:opacity-60"
      />

      <label className="text-ink/60 mb-2 block font-mono text-[10.5px] tracking-[.12em]" htmlFor="cat">
        KATEGORİ
      </label>
      <select
        id="cat"
        value={categoryId}
        disabled={busy}
        onChange={(e) => setCategoryId(e.target.value)}
        className="border-ink/[.18] text-ink mb-5 w-full border bg-white px-[14px] py-3 font-sans text-[14.5px] disabled:opacity-60"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <div className="text-ink/[.55] mb-5 -mt-3 text-[12px] leading-[1.5]">
        Kategori seçiminiz AI tarafından içerikle karşılaştırılır; uyumsuzluk hakeme bildirilir.
      </div>

      <label className="text-ink/60 mb-2 block font-mono text-[10.5px] tracking-[.12em]" htmlFor="file">
        RAPOR DOSYASI
      </label>
      <input
        id="file"
        ref={fileRef}
        type="file"
        accept="application/pdf"
        disabled={busy}
        className="border-ink/[.28] bg-ink/[.02] mb-2 w-full border border-dashed px-4 py-5 text-[13px] disabled:opacity-60"
      />
      <div className="text-ink/50 mb-6 font-mono text-[11px]">
        PDF · MAKS. 20 MB · metin katmanı içermeli (taranmış görüntü kabul edilmiyor)
      </div>

      {error && (
        <div className="border-danger text-danger mb-5 border bg-[rgba(180,72,63,.06)] px-4 py-3 text-[13px] leading-[1.55]">
          {error}
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="border-teal mb-5 border bg-[rgba(76,133,119,.06)] px-4 py-3">
          <div className="text-teal-ink mb-2 font-mono text-[10.5px] tracking-[.12em]">
            AI ANALİZİ SÜRÜYOR · {progress.done}/{progress.total} KONTROL
          </div>
          <div className="bg-ink/[.09] h-[5px]">
            <div
              className="bg-teal h-[5px] transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {phase === 'done' && reportId && (
        <div className="border-success mb-5 border bg-[rgba(63,125,92,.06)] px-4 py-3 text-[13px] leading-[1.6]">
          Rapor yüklendi ve analiz tamamlandı. Değerlendirme hakem incelemesine geçti; sonuç
          yayımlandığında <span className="font-mono">{reportId.slice(0, 8)}</span> raporunuzun
          sayfasında görünecek.
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="bg-ink w-full cursor-pointer border-none py-[14px] font-sans text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {phase === 'uploading'
          ? 'Yükleniyor…'
          : phase === 'analyzing'
            ? 'Analiz ediliyor…'
            : 'Raporu Yükle ve Analiz Et'}
      </button>
    </form>
  );
}
