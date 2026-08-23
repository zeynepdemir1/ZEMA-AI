import type { Metadata } from 'next';
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/**
 * PLAN.md §6.1 — Space Grotesk (başlık, seyrek), IBM Plex Sans (gövde),
 * IBM Plex Mono ("ölçülebilir" değerler: yüzdeler, kriter kodları, zaman damgaları).
 * latin-ext alt kümesi Türkçe glifler (ş ğ ı İ ç ö ü) için zorunlu.
 */
const grotesk = Space_Grotesk({
  variable: '--font-grotesk',
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ZEMA — Rapor Değerlendirme Altyapısı',
  description:
    'TEKNOFEST raporlarını şablon, içerik tutarlılığı, kategori uyumu ve benzerlik açısından analiz eder; kriter bazlı taslak geri bildirim üretir. Kararı hakem verir.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="tr"
      className={`${grotesk.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="bg-canvas text-ink flex min-h-full flex-col">{children}</body>
    </html>
  );
}
