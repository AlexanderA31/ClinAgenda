import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC = ['/', '/ingresar', '/paciente/ingresar', '/paciente/registro'];

/** Si no hay cookie de sesión, las pantallas internas mandan al ingreso. La API valida la sesión de verdad. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // /c/<token>: enlace que recibe el paciente para ver o cancelar su cita, sin usuario.
  if (PUBLIC.includes(pathname) || pathname.startsWith('/c/')) return NextResponse.next();
  // Portal del paciente: su propia cookie y su propia pantalla de ingreso.
  if (pathname === '/paciente' || pathname.startsWith('/paciente/')) {
    if (req.cookies.has('clinagenda_paciente')) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = '/paciente/ingresar';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
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
