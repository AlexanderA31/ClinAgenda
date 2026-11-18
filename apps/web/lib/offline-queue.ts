'use client';

import { createStore, del, entries, set } from 'idb-keyval';
import type { AppointmentCancelInput, AppointmentCreateInput } from '@clinagenda/schemas';
import { ApiRequestError, OfflineError, api } from './api';

/**
 * Clínica Sur: si se cae el internet a mitad de agendar, la cita NO se pierde ni se da por hecha.
 * Queda guardada en este navegador como "pendiente de enviar", con una clave única (Idempotency-Key)
 * para que al reintentar el servidor no la cree dos veces. Al volver la conexión se envía sola.
 * Si al enviarla el horario ya fue tomado, queda como "con conflicto" para que la recepcionista decida.
 * Las cancelaciones hechas sin internet también se guardan y se envían igual (el paciente que llama
 * para cancelar no debe esperar a que vuelva la conexión).
 */

export interface PendingAppointment {
  key: string;
  /** create = cita nueva; cancel = cancelación hecha sin internet. */
  kind?: 'create' | 'cancel';
  input?: AppointmentCreateInput;
  appointmentId?: string;
  cancel?: AppointmentCancelInput;
  summary: string;
  createdAt: string;
  status: 'PENDING' | 'CONFLICT';
  error?: string;
}

const store = typeof indexedDB !== 'undefined' ? createStore('clinagenda', 'pendientes') : undefined;
const listeners = new Set<() => void>();

export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const notify = () => listeners.forEach((fn) => fn());

export async function listPending(): Promise<PendingAppointment[]> {
  if (!store) return [];
  const all = await entries<string, PendingAppointment>(store);
  return all.map(([, v]) => v).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function enqueue(item: Omit<PendingAppointment, 'createdAt' | 'status'>) {
  if (!store) return;
  await set(item.key, { ...item, createdAt: new Date().toISOString(), status: 'PENDING' }, store);
  notify();
}

export async function discard(key: string) {
  if (!store) return;
  await del(key, store);
  notify();
}

let flushing = false;
/** Envía las citas pendientes. Devuelve cuántas se confirmaron. */
export async function flushQueue(): Promise<{ sent: number; conflicts: number }> {
  if (!store || flushing) return { sent: 0, conflicts: 0 };
  flushing = true;
  let sent = 0;
  let conflicts = 0;
  try {
    for (const item of await listPending()) {
      if (item.status !== 'PENDING') continue;
      try {
        if (item.kind === 'cancel') {
          // Cancelar es idempotente en el servidor: si alguien ya la canceló, no pasa nada.
          await api(`/appointments/${item.appointmentId}/cancel`, { method: 'POST', body: item.cancel });
        } else {
          await api('/appointments', { method: 'POST', body: item.input, headers: { 'Idempotency-Key': item.key } });
        }
        await del(item.key, store);
        sent++;
      } catch (e) {
        if (e instanceof OfflineError) break;
        if (e instanceof ApiRequestError) {
          await set(item.key, { ...item, status: 'CONFLICT', error: e.message }, store);
          conflicts++;
        }
      }
    }
  } finally {
    flushing = false;
    notify();
  }
  return { sent, conflicts };
}

export function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : String(Date.now()) + Math.random().toString(36).slice(2);
}
