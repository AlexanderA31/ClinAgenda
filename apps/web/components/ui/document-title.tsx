'use client';

import { useEffect } from 'react';
import { isPortalPath } from '@/lib/paths';

/**
 * Título de la pestaña según la pantalla ("Agenda · ClinAgenda"): las pantallas del sistema son de cliente
 * y no pueden declarar `metadata`. Ayuda a quien tiene varias pestañas abiertas y a los lectores de pantalla.
 */
export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    const { pathname } = location;
    // Ojo: /pacientes es del personal; el portal es /paciente y lo que va debajo.
    const brand = isPortalPath(pathname) ? 'Clínicas Paredes' : 'ClinAgenda';
    document.title = `${title} · ${brand}`;
  }, [title]);
  return null;
}
