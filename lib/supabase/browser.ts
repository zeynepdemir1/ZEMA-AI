import { createBrowserClient } from '@supabase/ssr';

/**
 * Tarayıcı istemcisi — YALNIZCA imzalı yükleme URL'sine dosya göndermek için.
 *
 * Neden gerekti: rapor PDF'i multipart olarak kendi API rotamıza gidiyordu ve
 * Vercel'de serverless fonksiyonların istek gövdesi 4,5 MB ile sınırlı. 20 MB
 * sınırı ilan eden bir form, üretimde 5 MB'lık bir ÖTR'yi bile platformun
 * kendi hatasıyla reddedebilirdi — hem de bizim JSON'umuz olmayan bir hatayla.
 *
 * Çözüm: dosya tarayıcıdan DOĞRUDAN Supabase Storage'a gidiyor; sunucu
 * fonksiyonu yalnızca küçük bir JSON alıyor. Yol adı sunucuda oturumdan
 * türetiliyor, istemci seçemiyor (bkz. /api/reports/upload-url).
 *
 * Sadece publishable (anon) anahtar kullanılır — RLS geçerli.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
