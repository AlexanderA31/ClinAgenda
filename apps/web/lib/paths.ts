/**
 * Rutas del portal del paciente: "/paciente" y lo que va debajo. Ojo: "/pacientes" es del personal,
 * así que no basta con startsWith('/paciente').
 */
export function isPortalPath(path: string): boolean {
  return path === '/paciente' || path.startsWith('/paciente/');
}

/**
 * A dónde volver después de ingresar ("?next="). Solo una ruta interna de este sitio y del tipo de cuenta
 * que ingresó; "//otro-sitio.com" o "/\otro-sitio.com" se rechazan (el navegador los trataría como otro dominio).
 */
export function safeNext(next: string | null | undefined, kind: 'staff' | 'patient'): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  const path = next.split(/[?#]/)[0];
  if (path === '/ingresar') return null;
  return isPortalPath(path) === (kind === 'patient') ? next : null;
}
