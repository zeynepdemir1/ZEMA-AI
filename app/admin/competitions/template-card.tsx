'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { revertTemplateSpec } from './actions';

const MAX_BYTES = 10 * 1024 * 1024;

const SECTION = 'font-mono text-[11px] tracking-[.1em] text-ink/75';
const BODY = 'text-[14px] leading-[1.7] text-ink/85';
const MUTED = 'text-[13px] leading-[1.6] text-ink/75';

type Result = {
  spec: {
    required_sections: string[];
    criteria: unknown[];
  };
  model: string;
  mocked: boolean;
  page_count: number;
  quotes: Array<{ verified: boolean }>;
  criteria: { replaced: number };
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '');
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: `Sunucu beklenmeyen bir yanıt döndü (HTTP ${res.status}).` };
  }
}

export function TemplateCard({
  competitionId,
  hasPrevious,
}: {
  competitionId: string;
  hasPrevious: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'reading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  const busy = phase === 'uploading' || phase === 'reading' || pending;

  async function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Şablon PDF\'i seçmelisiniz.');
    if (file.type && file.type !== 'application/pdf') {
      return setError(`Yalnızca PDF kabul ediliyor (seçilen: ${file.type}).`);
    }
    if (file.size > MAX_BYTES) {
      return setError(`Dosya çok büyük (${(file.size / 1048576).toFixed(1)} MB). Sınır 10 MB.`);
    }
    setError(null);
    setResult(null);
    setPhase('uploading');

    // Dosya doğrudan Storage'a — kendi fonksiyonumuzun gövdesinden geçmiyor.
    const su = await fetch(`/api/competitions/${competitionId}/template-url`, { method: 'POST' });
    const sb = await readJson(su);
    if (!su.ok || typeof sb.path !== 'string' || typeof sb.token !== 'string') {
      setPhase('error');
      return setError(String(sb.error ?? 'Yükleme adresi alınamadı.'));
    }
    const { error: ue } = await supabaseBrowser()
      .storage.from('reports')
      .uploadToSignedUrl(sb.path, sb.token, file, { contentType: 'application/pdf' });
    if (ue) {
      setPhase('error');
      return setError(`Yükleme başarısız: ${ue.message}`);
    }

    setPhase('reading');
    const res = await fetch(`/api/competitions/${competitionId}/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: sb.path }),
    });
    const body = await readJson(res);
    if (!res.ok) {
      setPhase('error');
      return setError(String(body.error ?? 'Şablon çözümlenemedi.'));
    }
    setResult(body as unknown as Result);
    setPhase('done');
    router.refresh();
  }

  function onRevert() {
    startTransition(async () => {
      const r = await revertTemplateSpec(competitionId);
      if (!r.ok) setError(r.error ?? 'Geri alınamadı.');
      else {
        setResult(null);
        setPhase('idle');
        router.refresh();
      }
    });
  }

  const verified = result?.quotes.filter((q) => q.verified).length ?? 0;

  return (
    <div className="border-ink/10 border bg-white px-[22px] py-5">
      <div className={`${SECTION} mb-2`}>ŞABLON PDF&apos;İNDEN OTOMATİK KURULUM</div>
      <p className={`${BODY} mb-4`}>
        Gerçek yarışma şablonunu yükleyin. Zorunlu bölümler, biçim kuralları, atıf biçimi ve
        şablonda tanımlıysa değerlendirme kriterleri (rubrik) PDF&apos;ten okunup yarışma
        yapılandırmasına yazılır — elle doldurmanız gerekmez. Raporlar analiz edilirken AI bu
        kriterleri kullanır.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        disabled={busy}
        className="border-ink/[.28] bg-ink/[.02] mb-2 w-full border border-dashed px-4 py-4 text-[13px] disabled:opacity-60"
      />
      <div className={`${MUTED} mb-4`}>PDF · maks. 10 MB · metin katmanı içermeli</div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onUpload}
          disabled={busy}
          className="bg-t3-blue px-4 py-2.5 font-mono text-[11px] tracking-[.1em] text-white disabled:opacity-50"
        >
          {phase === 'uploading' ? 'YÜKLENİYOR…' : phase === 'reading' ? 'ŞABLON OKUNUYOR…' : 'YÜKLE VE ÇÖZÜMLE'}
        </button>
        {hasPrevious && (
          <button
            type="button"
            onClick={onRevert}
            disabled={busy}
            className="border-ink/[.22] text-ink/85 border px-4 py-2.5 font-mono text-[11px] tracking-[.1em] disabled:opacity-50"
          >
            ÖNCEKİ ŞABLONA DÖN
          </button>
        )}
      </div>

      {error && (
        <div className="border-danger text-danger mt-4 border bg-[rgba(180,72,63,.06)] px-4 py-3 text-[13.5px] leading-[1.6]">
          {error}
        </div>
      )}

      {/* Başarı göstergesi — DETAY YOK. Zorunlu bölümler, biçim kuralları,
          içerik kuralları ve kriterler artık aşağıdaki kalıcı kutularda
          (bu kart sadece "yükle" işini yapıyor, sonucu iki kere göstermeyelim). */}
      {result && (
        <div className="border-success mt-5 border bg-[rgba(63,125,92,.06)] px-4 py-3">
          <div className="text-success font-mono text-[11px] tracking-[.1em]">
            ✓ ŞABLON ÇÖZÜMLENDİ · {result.page_count} SAYFA OKUNDU
          </div>
          <div className={`${MUTED} mt-1.5`}>
            {result.mocked ? (
              <>Mock mod (MOCK_AI=true) — gerçek çağrı yapılmadı, sabit çıktı gösterildi.</>
            ) : (
              <>
                {result.model} · {result.spec.required_sections.length} zorunlu bölüm ·{' '}
                {result.spec.criteria.length} kriter · alıntı doğrulama: {verified}/
                {result.quotes.length}
                {result.criteria.replaced > 0 && ` · kriterler güncellendi (${result.criteria.replaced})`}
              </>
            )}
            {' '}— aşağıdaki kutulara yazıldı.
          </div>
        </div>
      )}
    </div>
  );
}
