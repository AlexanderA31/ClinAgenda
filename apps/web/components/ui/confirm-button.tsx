'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from './button';

/**
 * "Quitar" en dos pasos: el primer toque pregunta y el segundo confirma. Para acciones que no se pueden
 * deshacer desde la pantalla, sin abrir un diálogo.
 */
export function ConfirmButton({ label, confirmLabel, onConfirm, busy = false, ariaLabel }: { label: string; confirmLabel: string; onConfirm: () => void; busy?: boolean; ariaLabel?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="ghost" size="sm" className="shrink-0" disabled={busy} onClick={() => setAsking(true)} aria-label={ariaLabel}>
        <Trash2 /> {label}
      </Button>
    );
  }
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1" role="group" aria-label="Confirmar">
      <Button variant="danger" size="sm" disabled={busy} onClick={() => (setAsking(false), onConfirm())} autoFocus>
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAsking(false)}>
        No
      </Button>
    </span>
  );
}
