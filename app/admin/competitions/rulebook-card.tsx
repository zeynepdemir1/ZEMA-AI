'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

const MAX_BYTES = 10 * 1024 * 1024;

const SECTION = 'font-mono text-[11px] tracking-[.1em] text-ink/75';
const BODY = 'text-[14px] leading-[1.7] text-ink/85';
const MUTED = 'text-[13px] leading-[1.6] text-ink/75';

type Quote = { quote: string; section_ref: string; verified: boolean; match: string };
type Criterion = {
  code: string;
  name: string;
  description: string;
  max_score: number;
  weight: number;
};
type Result = {
  spec: {
    competition_name: string;
    criteria: Criterion[];
    extra_rules: string[];
    not_specified: string[];
  };
  model: string;
  mocked: boolean;
  page_count: number;
  quotes: Quote[];
  criteria?: { replaced: number; existing: number; note?: string };
};

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text().catch(() => '');
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: `Sunucu beklenmeyen bir yanıt döndü (HTTP ${res.status}).` };
  }
}

/**
 * ŞARTNAME (yarışma kuralları) yükleme kartı.
 *
 * NEDEN ŞABLONDAN AYRI: puanlama rubriği çoğu TEKNOFEST yarışmasında rapor
 * şablonunda DEĞİL şartnamede bulunuyor. Sahada ölçüldü — gerçek bir ÖTR
 * şablonundan ve bir Model Uydu PDR şablonundan çıkarılan kriter sayısı
 * ikisinde de 0 çıktı ve yarışma kriter olmadan kalıyordu.
 *
 * Şablon "raporu nasıl yazacaksın"ı, şartname "nasıl puanlanacaksın"ı
 * anlatır. İkisi birlikte template_spec'i dolduruyor ve hangi alanın hangi
 * belgeden geldiği sources.<tür> altında işaretleniyor.
 */
export function RulebookCard({
  competitionId,
  competitionName,
}: {
  competitionId: string;
  competitionName: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'reading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const busy = phase === 'uploading' || phase === 'reading';

  async function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Şartname PDF\'i seçmelisiniz.');
    if (file.type && file.type !== 'application/pdf') {
      return setError(`Yalnızca PDF kabul ediliyor (seçilen: ${file.type}).`);
    }
    if (file.size > MAX_BYTES) {
      return setError(`Dosya çok büyük (${(file.size / 1048576).toFixed(1)} MB). Sınır 10 MB.`);
    }
    setError(null);
    setResult(null);
    setPhase('uploading');

    const su = await fetch(`/api/competitions/${competitionId}/rulebook-url`, { method: 'POST' });
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
    const res = await fetch(`/api/competitions/${competitionId}/rulebook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: sb.path }),
    });
    const body = await readJson(res);
    if (!res.ok) {
      setPhase('error');
      return setError(String(body.error ?? 'Şartname çözümlenemedi.'));
    }
    setResult(body as unknown as Result);
    setPhase('done');
    router.refresh();
  }

  const verified = result?.quotes.filter((q) => q.verified).length ?? 0;
  const found = result?.spec.criteria.length ?? 0;
  const totalWeight = Math.round(
    (result?.spec.criteria.reduce((a, c) => a + c.weight, 0) ?? 0) * 100,
  );
  /** Yüklenen belge başka bir yarışmaya mı ait? Şablon karışıklığı bir kez yaşandı. */
  const mismatch =
    result?.spec.competition_name &&
    !competitionName
      .toLocaleLowerCase('tr')
      .split(/[\s—–-]+/)
      .filter((w) => w.length > 3)
      .some((w) => result.spec.competition_name.toLocaleLowerCase('tr').includes(w));

  return (
    <div className="border-ink/10 border bg-white px-[22px] py-5">
      <div className={`${SECTION} mb-2`}>ŞARTNAME (YARIŞMA KURALLARI)</div>
      <p className={`${BODY} mb-4`}>
        Yarışmanın resmî kurallar belgesini yükleyin. <strong>Değerlendirme kriterleri
        (rubrik)</strong> buradan çıkarılır — rapor şablonunda genellikle bulunmaz.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        disabled={busy}
        className="border-ink/[.28] bg-ink/[.02] mb-2 w-full border border-dashed px-4 py-4 text-[13px] disabled:opacity-60"
      />
      <div className={`${MUTED} mb-4`}>PDF · maks. 10 MB · metin katmanı içermeli</div>

      <button
        type="button"
        onClick={onUpload}
        disabled={busy}
        className="bg-t3-blue px-4 py-2.5 font-mono text-[11px] tracking-[.1em] text-white disabled:opacity-50"
      >
        {phase === 'uploading'
          ? 'YÜKLENİYOR…'
          : phase === 'reading'
            ? 'ŞARTNAME OKUNUYOR…'
            : 'YÜKLE VE RUBRİĞİ ÇIKAR'}
      </button>

      {error && (
        <div className="border-danger text-danger mt-4 border bg-[rgba(203,36,26,.06)] px-4 py-3 text-[13.5px] leading-[1.6]">
          {error}
        </div>
      )}

      {result && (
        <div className="border-ink/[.12] mt-5 border-t pt-4">
          <div className={`${SECTION} mb-2.5`}>
            ÇÖZÜMLENDİ · {result.page_count} SAYFA OKUNDU
          </div>

          {/* Yanlış belge kontrolü — Model Uydu şablonunun İHA yarışmasına
              uygulanması bir kez yaşandı, fark edilmesi zor oldu. */}
          {mismatch && (
            <div className="border-danger mb-4 border-l-2 pl-3">
              <div className={`${SECTION} mb-1.5`}>DOĞRU BELGE Mİ?</div>
              <div className={BODY}>
                Şartname kendini <strong>&ldquo;{result.spec.competition_name}&rdquo;</strong> olarak
                tanıtıyor, ama bu yarışma <strong>{competitionName}</strong>. Yanlış belgeyi
                yüklemiş olabilirsiniz.
              </div>
            </div>
          )}

          {found > 0 ? (
            <>
              <div className={`${BODY} mb-2`}>
                <strong>{found} değerlendirme kriteri</strong> çıkarıldı ve aşağıdaki
                &ldquo;Değerlendirme Kriterleri&rdquo; bölümüne yazıldı.
                {totalWeight !== 100 && ` Ağırlık toplamı %${totalWeight}.`}
              </div>
              <ul className={`${MUTED} m-0 mb-4 list-none p-0`}>
                {result.spec.criteria.map((c) => (
                  <li key={c.code + c.name} className="mb-1">
                    <span className="font-mono">{c.code}</span> {c.name} — maks {c.max_score} · %
                    {Math.round(c.weight * 100)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            // Rubrik yoksa SESSİZ kalma. Bazı şartnameler gerçekten
            // rubrik içermez; elle giriş yolu açık tutuluyor.
            <div className="border-gold-ink/40 mb-4 border-l-2 pl-3">
              <div className={`${SECTION} mb-1.5`}>PUANLAMA KRİTERİ BULUNAMADI</div>
              <div className={`${BODY} mb-2`}>
                {result.criteria && result.criteria.existing > 0
                  ? `Bu şartnamede puanlama rubriği bulunamadı — yarışmadaki mevcut ${result.criteria.existing} kritere DOKUNULMADI.`
                  : 'Bu şartnamede puanlama rubriği bulunamadı — kriterleri elle girmeniz gerekiyor.'}
              </div>
              <div className={`${MUTED} mb-3`}>
                Bazı yarışmalarda rubrik ayrı bir ekte veya hiç yayımlanmamış olabilir.
                Model uydurmak yerine boş bırakıyor.
              </div>
              {(!result.criteria || result.criteria.existing === 0) && (
                <a
                  href="#kriterler"
                  className="bg-t3-blue inline-block px-4 py-2 font-mono text-[11px] tracking-[.1em] text-white no-underline"
                >
                  KRİTERLERİ ELLE GİR →
                </a>
              )}
            </div>
          )}

          {result.spec.extra_rules.length > 0 && (
            <div className="border-ink/[.12] mb-4 border-l-2 pl-3">
              <div className={`${SECTION} mb-1.5`}>
                ŞARTNAMEDEN EK KURALLAR · {result.spec.extra_rules.length}
              </div>
              <ul className={`${MUTED} m-0 list-disc pl-4`}>
                {result.spec.extra_rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className={MUTED}>
            {result.mocked ? (
              <>Mock mod (MOCK_AI=true) — gerçek çağrı yapılmadı, sabit çıktı gösterildi.</>
            ) : (
              <>
                {result.model} · alıntı doğrulama: {verified}/{result.quotes.length} alıntı
                şartname metninde birebir bulundu
                {verified < result.quotes.length && ' — doğrulanmayanları gözden geçirin'}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
