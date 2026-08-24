'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

/**
 * PLAN.md §2.1 — analiz kuyruğunun ANA tetikleyicisi burası:
 * yükleme bittikten sonra client `/api/jobs/tick`'i döngüde çağırır.
 * Vercel Cron'a güvenilmiyor (Hobby planında sıklık çok kısıtlı).
 */
const MAX_TICKS = 20;
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Sunucu yanıtını GÜVENLE oku.
 *
 * Eskiden `await res.json()` çıplaktı. Yanıt JSON değilse (platformun kendi
 * 413/502 sayfası, proxy hatası) bu satır throw ediyor, onSubmit async
 * olduğu için hata hiçbir yerde yakalanmıyor ve form sonsuza kadar
 * "yükleniyor"da kalıyordu — kullanıcıya tek bir kelime bile göstermeden.
 */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '');
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {
      error:
        `Sunucu beklenmeyen bir yanıt döndü (HTTP ${res.status}). ` +
        (res.status === 413
          ? 'Dosya sunucunun kabul ettiğinden büyük olabilir.'
          : 'Lütfen tekrar deneyin.'),
    };
  }
}

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

    // İstemci tarafı ön kontrol: sunucuya gitmeden anlaşılan hataları
    // burada söyle, kullanıcı 20 MB'ı boşuna yüklemesin.
    if (file.type && file.type !== 'application/pdf') {
      return setError(`Yalnızca PDF kabul ediliyor (seçilen: ${file.type || 'bilinmeyen tür'}).`);
    }
    if (file.size > MAX_BYTES) {
      return setError(
        `Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)} MB). Sınır 20 MB.`,
      );
    }
    if (file.size === 0) {
      return setError('Seçilen dosya boş (0 bayt).');
    }

    setError(null);
    setPhase('uploading');

    // ── AŞAMA 1: dosyayı DOĞRUDAN Storage'a yükle ──
    // Kendi API rotamızdan geçirmiyoruz: Vercel'de serverless fonksiyonların
    // istek gövdesi 4,5 MB ile sınırlı, yani 20 MB'lık ilan yalan olurdu.
    // İmzalı URL'nin yolu sunucuda oturumdan türetiliyor (istemci seçemiyor).
    let uploadedPath: string | null = null;
    try {
      const su = await fetch('/api/reports/upload-url', { method: 'POST' });
      const sb = await readJson(su);
      if (su.ok && typeof sb.path === 'string' && typeof sb.token === 'string') {
        const { error: ue } = await supabaseBrowser()
          .storage.from('reports')
          .uploadToSignedUrl(sb.path, sb.token, file, { contentType: 'application/pdf' });
        if (!ue) uploadedPath = sb.path;
      }
    } catch {
      // Yut: aşağıdaki multipart yoluna düşülecek.
    }

    // ── AŞAMA 2: sunucuya yalnızca yolu bildir (küçük JSON gövde) ──
    // İmzalı yükleme herhangi bir sebeple başarısız olduysa eski multipart
    // yolu yedek olarak duruyor — yerelde ve küçük dosyalarda çalışır.
    let res: Response;
    if (uploadedPath) {
      res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: uploadedPath,
          title: title.trim(),
          category_id: categoryId,
        }),
      });
    } else {
      const form = new FormData();
      form.set('file', file);
      form.set('title', title.trim());
      form.set('category_id', categoryId);
      res = await fetch('/api/reports', { method: 'POST', body: form });
    }
    const body = await readJson(res);
    if (!res.ok) {
      setPhase('error');
      setError(String(body.error ?? 'Yükleme başarısız.'));
      return;
    }

    setReportId(String(body.report_id));
    setProgress({ done: 0, total: Number(body.jobs_queued ?? 6) });
    setPhase('analyzing');

    // Kuyruğu döndür — her tick 1-2 iş çalıştırır.
    // reportId gönderiliyor: global `pending` ilerleme çubuğu için yanlış,
    // başka raporun kuyruğu varsa çubuk 0'da takılıyor.
    for (let i = 0; i < MAX_TICKS; i++) {
      const t = await fetch('/api/jobs/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: body.report_id }),
      });
      const td = await t.json().catch(() => ({}));
      if (typeof td.reportPending === 'number') {
        setProgress((p) => ({ ...p, done: Math.max(0, p.total - td.reportPending) }));
      }
      if (td.done || td.reportPending === 0) break;
    }

    setPhase('done');
    router.refresh();
  }

  const busy = phase === 'uploading' || phase === 'analyzing';

  return (
    <form onSubmit={onSubmit} className="border-ink/10 border bg-white p-7">
      <label className="text-ink/75 mb-2 block font-mono text-[10.5px] tracking-[.12em]" htmlFor="title">
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

      <label className="text-ink/75 mb-2 block font-mono text-[10.5px] tracking-[.12em]" htmlFor="cat">
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

      <label className="text-ink/75 mb-2 block font-mono text-[10.5px] tracking-[.12em]" htmlFor="file">
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
      <div className="text-ink/75 mb-6 font-mono text-[11px]">
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
