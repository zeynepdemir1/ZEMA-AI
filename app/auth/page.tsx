import { ZemaMark, ZemaWordmark, GridTexture } from '@/components/zema/brand';
import { AuthPanel } from './auth-panel';

export default function AuthPage() {
  return (
    <div className="grid min-h-[calc(100vh-0px)] grid-cols-1 lg:h-screen lg:grid-cols-[1.05fr_.95fr] lg:overflow-hidden">
      {/* ─── Sol: form ─── */}
      <div className="flex min-h-0 min-w-0 flex-col items-center justify-start gap-[34px] overflow-auto px-8 py-12 lg:px-16">
        <AuthPanel />
      </div>

      {/* ─── Sağ: "rolünüzü seçmenize gerek yok" anlatısı ─── */}
      <div className="bg-ink relative flex h-full flex-col justify-between overflow-hidden px-8 py-12 text-white lg:px-[52px]">
        <GridTexture cell={56} />

        <div className="relative flex items-center gap-3">
          <ZemaMark />
          <ZemaWordmark />
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center py-5">
          <svg
            viewBox="0 0 380 350"
            width="100%"
            className="max-h-full max-w-[400px]"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="AI altı kriteri analiz eder, hakem onaylar"
          >
            <text x="40" y="18" fill="#8FB8AC" fontFamily="IBM Plex Mono, monospace" fontSize="10" letterSpacing="1.6">
              AI ANALİZİ · 6 KRİTER
            </text>
            <rect x="40" y="30" width="216" height="286" stroke="rgba(255,255,255,.28)" strokeWidth="1.5" />
            <rect x="68" y="62" width="112" height="9" fill="rgba(255,255,255,.85)" />
            <rect x="68" y="82" width="66" height="7" fill="rgba(255,255,255,.32)" />
            <g fill="rgba(255,255,255,.20)">
              <rect x="68" y="116" width="160" height="6" />
              <rect x="68" y="132" width="142" height="6" />
              <rect x="68" y="148" width="154" height="6" />
              <rect x="68" y="184" width="132" height="6" />
              <rect x="68" y="200" width="160" height="6" />
              <rect x="68" y="216" width="112" height="6" />
              <rect x="68" y="252" width="150" height="6" />
              <rect x="68" y="268" width="90" height="6" />
            </g>
            <rect x="54" y="106" width="188" height="54" fill="#4C8577" opacity="0.16" />
            <rect x="54" y="106" width="188" height="54" stroke="#4C8577" strokeWidth="1.5" />
            <path d="M40 174 H256" stroke="#4C8577" strokeWidth="2" />
            <circle cx="256" cy="174" r="4" fill="#4C8577" />
            <g stroke="#4C8577" strokeWidth="1.5" opacity="0.5">
              <path d="M40 192 H256" />
              <path d="M40 208 H256" />
              <path d="M40 224 H256" />
            </g>
            <g stroke="#4C8577" strokeWidth="1.5">
              <path d="M40 30 h16 M40 30 v16" />
              <path d="M256 30 h-16 M256 30 v16" />
              <path d="M40 316 h16 M40 316 v-16" />
              <path d="M256 316 h-16 M256 316 v-16" />
            </g>
            <circle cx="272" cy="248" r="60" fill="#1B2A4A" />
            <circle cx="272" cy="248" r="60" stroke="#C98A3E" strokeWidth="2" />
            <circle cx="272" cy="248" r="48" stroke="#C98A3E" strokeWidth="1" opacity="0.55" />
            <path d="M250 248 l15 16 l30 -34" stroke="#C98A3E" strokeWidth="3" strokeLinecap="square" />
            <text x="272" y="330" fill="#C98A3E" fontFamily="IBM Plex Mono, monospace" fontSize="9.5" letterSpacing="1.6" textAnchor="middle">
              HAKEM ONAYI
            </text>
          </svg>
        </div>

        <div className="relative">
          <h2 className="font-heading m-0 mb-3 text-[26px] leading-[1.2] font-semibold text-pretty">
            Rolünüzü seçmenize gerek yok.
          </h2>
          <p className="m-0 mb-6 max-w-[380px] text-[14.5px] leading-[1.68] text-white/70">
            Kod girmezseniz <strong className="font-semibold text-white">Yarışmacı</strong> olarak
            kaydedilirsiniz. Hakem ve yönetici hesapları yalnızca T3 Vakfı&apos;nın verdiği kayıt
            koduyla açılır.
          </p>
          <div className="font-mono text-[10.5px] leading-[1.9] tracking-[.12em] text-white/[.42]">
            <div>4 ROL · TEK KAYIT AKIŞI</div>
            <div>KVKK AYDINLATMA METNİ ONAYI ZORUNLU</div>
          </div>
        </div>
      </div>
    </div>
  );
}
