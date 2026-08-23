/**
 * ZEMA marka işareti — tasarımdaki "gold çerçeve + teal çekirdek" kare.
 * Gold = hakem onayı, teal = AI üretimi. Logo bu iki katmanı taşıyor.
 */
export function ZemaMark({ size = 22 }: { size?: number }) {
  const inset = Math.round(size * 0.23);
  return (
    <div
      className="border-gold relative shrink-0 border-[1.5px]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div className="bg-teal absolute" style={{ inset }} />
    </div>
  );
}

export function ZemaWordmark({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`font-heading font-bold ${className}`}
      style={{ fontSize: size, letterSpacing: '0.16em' }}
    >
      ZEMA
    </span>
  );
}

/** Koyu zeminlerde tekrar eden ince ızgara dokusu. */
export function GridTexture({ cell = 64 }: { cell?: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)',
        backgroundSize: `${cell}px ${cell}px`,
      }}
    />
  );
}
