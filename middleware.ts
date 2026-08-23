import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Oturum yenileme + rota koruması (PLAN.md §6 RoleGuard'ın ilk katmanı).
 *
 * Middleware yalnızca "giriş var mı" sorusunu cevaplıyor; ROL kontrolü
 * sayfa/layout seviyesinde yapılıyor çünkü rol profiles tablosunda ve
 * middleware'de DB sorgusu her isteği yavaşlatır.
 */

/** Girişsiz erişilebilen rotalar. */
const PUBLIC = ['/', '/auth', '/gizlilik', '/demo'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getUser() token'ı doğruluyor ve gerekiyorsa yeniliyor — getSession() yetmez.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.includes(path);

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Statik dosyalar ve resim optimizasyonu hariç her şey.
     * /api/jobs/tick dahil — anonim çağrı artık /auth'a yönlenir, yani
     * kimliksiz kota tüketimi mümkün değil.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
