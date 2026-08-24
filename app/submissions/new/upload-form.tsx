'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

/**
 * PLAN.md §2.1 — analiz kuyruğunun ANA tetikleyicisi burası:
 * yükleme bittikten sonra client `/api/jobs/tick`'i döngüde çağırır.
 * Vercel Cron'a güvenilmiyor (Hobby planında sıklık çok kısıtlı).
 *
 * ⚠️ README'nin güvenlik modeli: yarışmacı ham AI analiz sürecini hiçbir
 * şekilde görmemeli (yalnızca hakem onaylı `feedback` nihai sonucunu görür).
 * Bu yüzden tetikleme döngüsü hâlâ burada çalışıyor — kuyruğun tek
 * güvenilir tetikleyicisi bu, Vercel Cron'a düşmek istemiyoruz — ama
 * SESSİZ: hiçbir state güncellemesi yapmıyor, hiçbir "X/6 KONTROL" göstergesi
 * render etmiyor. Kullanıcı yüklemeden hemen sonra yönlendiriliyor; bu
 * fonksiyon arka planda, ekranda görünmeden ilerlemeye devam ediyor.
 */
async function tickQueueInBackground(reportId: string) {
  for (let i = 0; i < MAX_TICKS; i++) {
    try {
      const t = await fetch('/api/jobs/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId }),
      });
      const td = await t.json().catch(() => ({}));
      if (td.done || td.reportPending === 0) break;
    } catch {
      break; // ağ hatası — sessizce vazgeç, yedek Vercel Cron devam ettirir
    }
  }
}

/** Başarı mesajının ekranda kalma süresi — yönlendirmeden önce okunabilsin. */
const REDIRECT_DELAY_MS = 1400;
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

type Phase = 'idle' | 'uploading' | 'done' | 'error';

export function UploadForm({ categories }: { categories: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
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

    const newReportId = String(body.report_id);
    setReportId(newReportId);
    setPhase('done');

    // Kuyruğu tetikle — AMA sessizce. Bu, analiz işlerinin tek güvenilir
    // tetikleyicisi (PLAN.md §2.1, Vercel Cron Hobby planında güvenilmez);
    // kaldırılmıyor, yalnızca yarışmacıya hiçbir ilerleme göstermiyor.
    // Yönlendirmeden SONRA da arka planda çalışmaya devam eder.
    void tickQueueInBackground(newReportId);

    // Kısa bir süre başarı mesajını göster, sonra otomatik yönlendir.
    // Rapor detay sayfası (/submissions/[id]) yalnızca genel durum
    // etiketi gösterir — AI analiz ilerlemesi/skoru orada da yok.
    setTimeout(() => router.push(`/submissions/${newReportId}`), REDIRECT_DELAY_MS);
  }

  const busy = phase === 'uploading';

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

      {phase === 'done' && reportId && (
        <div className="border-success mb-5 border bg-[rgba(63,125,92,.06)] px-4 py-3 text-[13px] leading-[1.6]">
          Raporunuz alındı, değerlendirme sürecine girdi. Sonuç hakem onayından geçip
          yayımlandığında rapor sayfanızda görünecek — yönlendiriliyorsunuz…
        </div>
      )}

      <button
        type="submit"
        disabled={busy || phase === 'done'}
        className="bg-ink w-full cursor-pointer border-none py-[14px] font-sans text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {phase === 'uploading' ? 'Yükleniyor…' : phase === 'done' ? 'Alındı ✓' : 'Raporu Yükle ve Analiz Et'}
      </button>
    </form>
  );
}
