import { CRITERIA_LIST, SETUP_STEPS } from '@/lib/design/mock-data';
import { ThresholdCard } from './threshold-card';

export default function CompetitionSetupPage() {
  return (
    <div className="flex-1 px-6 pt-[38px] pb-[72px] lg:px-10">
      <div className="mx-auto max-w-[980px]">
        {/* Adım göstergesi */}
        <div className="mb-[30px] flex flex-wrap items-center">
          {SETUP_STEPS.map(([num, label], i) => {
            const active = i < 2;
            return (
              <div
                key={num}
                className={`border-ink/[.12] flex flex-1 items-center gap-2.5 border px-5 py-3 ${
                  i > 0 ? 'border-l-0' : ''
                } ${active ? 'text-ink bg-white' : 'text-ink/[.45] bg-transparent'}`}
              >
                <span
                  className={`flex h-[22px] w-[22px] items-center justify-center border font-mono text-[11px] ${
                    active
                      ? 'border-ink bg-ink text-white'
                      : 'border-ink/[.25] text-ink/50 bg-transparent'
                  }`}
                >
                  {num}
                </span>
                <span className="text-[13.5px] font-medium">{label}</span>
              </div>
            );
          })}
        </div>

        <h2 className="font-heading m-0 mb-1.5 text-[28px] font-semibold">Yeni yarışma tanımla</h2>
        <p className="text-ink/[.62] m-0 mb-7 text-[14.5px]">
          Şablon ve kriterler, AI&apos;nin analiz sırasında kullanacağı referanstır.
        </p>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.1fr_.9fr]">
          {/* Sol: yarışma bilgileri + rubrik */}
          <div className="border-ink/10 border bg-white p-[26px]">
            <label
              htmlFor="comp-name"
              className="text-ink/60 mb-[7px] block font-mono text-[10.5px] tracking-[.12em]"
            >
              YARIŞMA ADI
            </label>
            <input
              id="comp-name"
              defaultValue="TEKNOFEST 2026 — İnsansız Hava Araçları"
              className="border-ink/[.18] text-ink mb-[18px] w-full border bg-white px-[14px] py-3 font-sans text-[14.5px]"
            />

            <label
              htmlFor="comp-category"
              className="text-ink/60 mb-[7px] block font-mono text-[10.5px] tracking-[.12em]"
            >
              KATEGORİ
            </label>
            <select
              id="comp-category"
              className="border-ink/[.18] text-ink mb-[18px] w-full border bg-white px-[14px] py-3 font-sans text-[14.5px]"
            >
              <option>Havacılık ve Uzay</option>
              <option>Savunma Teknolojileri</option>
              <option>Yapay Zeka</option>
            </select>

            <span className="text-ink/60 mb-[7px] block font-mono text-[10.5px] tracking-[.12em]">
              RAPOR ŞABLONU
            </span>
            <div className="border-ink/[.28] bg-ink/[.02] mb-5 border border-dashed p-[22px] text-center">
              <div className="mb-1 text-[14px] font-medium">Şablon dosyasını sürükleyin</div>
              <div className="text-ink/50 font-mono text-[11px]">PDF, DOCX · MAKS. 20 MB</div>
            </div>

            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-ink/60 font-mono text-[10.5px] tracking-[.12em]">
                DEĞERLENDİRME KRİTERLERİ
              </span>
              <span className="text-ink/[.45] font-mono text-[11px]">
                {CRITERIA_LIST.length} KRİTER
              </span>
            </div>
            <div className="mb-3 flex flex-col gap-1.5">
              {CRITERIA_LIST.map((k) => (
                <div
                  key={k.code}
                  className="border-ink/[.12] flex items-center gap-3 border px-3 py-2.5"
                >
                  <span className="text-ink/[.45] font-mono text-[10.5px]">{k.code}</span>
                  <span className="text-[13.5px]">{k.title}</span>
                  <span className="text-ink/[.45] ml-auto font-mono text-[11px]">{k.weight}</span>
                </div>
              ))}
            </div>
            <button className="text-ink border-ink/[.22] cursor-pointer border bg-transparent px-4 py-[9px] font-sans text-[13px]">
              ＋ Kriter ekle
            </button>
          </div>

          {/* Sağ: eşik + AI kapsamı */}
          <div className="flex flex-col gap-5">
            <ThresholdCard />

            <div className="border-ink/10 border-l-teal border border-l-[3px] bg-white px-[22px] py-5">
              <div className="text-teal-ink mb-2 font-mono text-[10px] tracking-[.12em]">
                AI KONTROL KAPSAMI
              </div>
              <div className="text-ink/[.72] text-[13.5px] leading-[1.75]">
                Dil ve şablon uyumu · Başlık-içerik tutarlılığı · Kategori uygunluğu · Benzerlik
                analizi · Kriter bazlı taslak geri bildirim
              </div>
            </div>

            <button className="bg-ink cursor-pointer border-none p-[14px] font-sans text-[15px] font-semibold text-white">
              Yarışmayı Oluştur
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
