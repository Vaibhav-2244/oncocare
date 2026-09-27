import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isLocale, LOCALE_COOKIE } from '@/lib/locale';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-oncocare-auth-user');
    response = NextResponse.next({ request: { headers: requestHeaders } });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            requestHeaders.set('cookie', request.cookies.toString());
            response = NextResponse.next({ request: { headers: requestHeaders } });
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      requestHeaders.set('x-oncocare-auth-user', JSON.stringify({
        id: user.id,
        email: user.email || '',
        phone: user.phone || '',
      }));
      const forwardedResponse = NextResponse.next({ request: { headers: requestHeaders } });
      response.cookies.getAll().forEach((cookie) => forwardedResponse.cookies.set(cookie));
      response = forwardedResponse;
    }
  }

  const locale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!isLocale(locale)) {
    response.cookies.set(LOCALE_COOKIE, 'en', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};