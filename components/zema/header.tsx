import Image from 'next/image';
import Link from 'next/link';
import { ZemaMark, ZemaWordmark } from './brand';
import { SignOutButton } from './sign-out-button';
import { currentUser, ROLE_HOME, ROLE_LABEL } from '@/lib/supabase/server';

/**
 * TÜM sayfalarda kullanılan tek üst çubuk.
 *
 * NEDEN ORTAK BİLEŞEN: T3 logosu yalnızca app/page.tsx'e eklenmişti, yani
 * kullanıcı giriş yaptıktan sonra gördüğü hiçbir ekranda T3 aidiyeti
 * görünmüyordu — hakem inceleme, yarışma kurulumu, değerlendirme panosu
 * hepsi markasızdı. Kök layout'a taşındı: marka bloğu artık her sayfada
 * BİREBİR aynı piksel değerleriyle çiziliyor, sayfa başına kopyalanmıyor.
 *
 * Marka bloğu (ZEMA işareti + kelime + ayraç + T3 logosu) her yerde
 * değişmez. Sağ taraf role göre değişir — yarışmacıya hakem linki
 * göstermek doğru olmazdı; "birebir aynı" şartı logo boyutu ve konumu
 * içindi, rol menüsü için değil.
 */

/** Marka bloğunun ölçüleri — tek kaynak, sayfa başına farklılaşmasın. */
const MARK_PX = 28;
const WORDMARK_PX = 20;
/** T3 logosu 640×246 (en/boy 2.60). 40 px yükseklik ≈ 104 px genişlik,
 *  ZEMA işareti + kelime bloğuyla (~100 px) görsel olarak dengeli. */
const T3_LOGO_H = 40;

export async function Header() {
  const user = await currentUser();

  return (
    <header className="bg-ink-deep border-b border-white/[.12] text-white">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-6 py-3.5 lg:px-10">
        {/* ─── Marka bloğu — her sayfada birebir aynı ─── */}
        <Link
          href={user ? ROLE_HOME[user.role] : '/'}
          className="flex items-center gap-4 no-underline"
          aria-label="ZEMA ana sayfa"
        >
          <ZemaMark size={MARK_PX} />
          <ZemaWordmark size={WORDMARK_PX} className="text-white" />
          <span className="h-8 w-px bg-white/[.18]" aria-hidden />
          <Image
            src="/t3-vakfi-logo-white.png"
            alt="T3 Vakfı"
            width={640}
            height={246}
            style={{ height: T3_LOGO_H, width: 'auto' }}
            className="opacity-95"
            priority
          />
        </Link>

        {/* ─── Sağ: oturum durumu ─── */}
        <div className="flex items-center gap-5">
          {user ? (
            <>
              <span className="text-t3-amber font-mono text-[10.5px] tracking-[.12em]">
                {ROLE_LABEL[user.role]}
              </span>
              <span className="hidden text-[13px] text-white/[.78] sm:inline">
                {user.fullName ?? user.email}
              </span>
              <SignOutButton className="text-white/[.78] hover:text-white" />
            </>
          ) : (
            <Link
              href="/auth"
              className="bg-t3-blue px-4 py-2 font-mono text-[11px] tracking-[.12em] text-white no-underline"
            >
              GİRİŞ
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
