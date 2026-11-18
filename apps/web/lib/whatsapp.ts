import type { AppointmentView } from '@clinagenda/schemas';
import { dayLabel, time } from './format';

/**
 * Mensajes por WhatsApp sin contratar un proveedor: se abre WhatsApp (web o celular) con el texto listo
 * y la recepcionista solo presiona Enviar. Si más adelante se contrata WhatsApp Business API, estos
 * mismos textos se envían solos.
 */
export function waLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

export function patientUrl(appt: AppointmentView): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${appt.patientLink ?? ''}`;
}

function when(appt: AppointmentView) {
  return `${dayLabel(appt.startsAt.slice(0, 10))} a las ${time(appt.startsAt)}`;
}

export function confirmationText(appt: AppointmentView): string {
  return [
    `Hola, le saludamos de ${appt.clinic.name}.`,
    `Su cita (${appt.code}) con ${appt.doctor.fullName} quedó agendada para el ${when(appt)}.`,
    `Si no puede venir, cancélela aquí para dar el espacio a otro paciente: ${patientUrl(appt)}`,
    'Por favor llegue 10 minutos antes.',
  ].join('\n');
}

export function reminderText(appt: AppointmentView): string {
  return [
    `Hola, le recordamos su cita en ${appt.clinic.name} con ${appt.doctor.fullName} el ${when(appt)}.`,
    `Si no puede venir, avísenos o cancélela aquí: ${patientUrl(appt)}`,
  ].join('\n');
}
