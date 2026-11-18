import { cookies } from 'next/headers';
import type { PortalMe, SessionUser } from '@clinagenda/schemas';

export type ServerSession = { kind: 'staff'; name: string; home: '/agenda' } | { kind: 'patient'; name: string; home: '/paciente' } | null;

const API = () => process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/**
 * ¿Quién está viendo la página? Se pregunta a la API con las cookies del navegador (no basta con que la
 * cookie exista: puede estar vencida o cerrada por la dirección). Sirve para que la página pública y
 * "Ingresar" reconozcan una sesión abierta sin pedir de nuevo la contraseña.
 */
export async function getServerSession(): Promise<ServerSession> {
  const jar = await cookies();
  const staff = jar.get('clinagenda_session')?.value;
  const patient = jar.get('clinagenda_paciente')?.value;
  try {
    if (staff) {
      const res = await fetch(`${API()}/api/auth/me`, { headers: { cookie: `clinagenda_session=${staff}` }, cache: 'no-store' });
      if (res.ok) {
        const me = (await res.json()) as SessionUser;
        return { kind: 'staff', name: me.fullName, home: '/agenda' };
      }
    }
    if (patient) {
      const res = await fetch(`${API()}/api/portal/me`, { headers: { cookie: `clinagenda_paciente=${patient}` }, cache: 'no-store' });
      if (res.ok) {
        const me = (await res.json()) as PortalMe;
        return { kind: 'patient', name: me.firstNames.split(' ')[0], home: '/paciente' };
      }
    }
  } catch {
    /* API sin respuesta: se muestra como sin sesión y el ingreso decide */
  }
  return null;
}
