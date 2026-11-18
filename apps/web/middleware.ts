import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/', '/ingresar'];

/** Si no hay cookie de sesión, las pantallas internas mandan al ingreso. La API valida la sesión de verdad. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  if (!req.cookies.has('clinagenda_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/ingresar';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|sw.js|manifest.webmanifest|icon.svg|offline.html|favicon.ico).*)'],
};
