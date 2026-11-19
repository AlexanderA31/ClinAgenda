'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  AppointmentEventView,
  AppointmentView,
  AvailabilitySlot,
  ClinicView,
  DoctorView,
  Paginated,
  PatientView,
  RoleView,
} from '@clinagenda/schemas';
import { workClinics } from '@clinagenda/schemas';
import { api } from './api';
import { useSession } from './session';

export function useClinics() {
  return useQuery({ queryKey: ['clinics'], queryFn: () => api<ClinicView[]>('/clinics'), staleTime: 10 * 60_000 });
}

/** Las clínicas donde trabaja quien tiene la sesión (todas para la dirección o si no tiene asignadas). */
export function useWorkClinics() {
  const user = useSession();
  const clinics = useClinics();
  const mine = workClinics(user);
  return { ...clinics, data: mine ? clinics.data?.filter((c) => mine.includes(c.id)) : clinics.data };
}

export function useDoctors(clinicId?: string) {
  return useQuery({ queryKey: ['doctors', clinicId ?? 'all'], queryFn: () => api<DoctorView[]>('/doctors', { query: { clinicId } }), staleTime: 10 * 60_000 });
}

export type AppointmentQuery = {
  from?: string;
  to?: string;
  clinicId?: string;
  doctorId?: string;
  patientId?: string;
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: string;
};

export function useAppointments(query: AppointmentQuery, enabled = true) {
  return useQuery({
    queryKey: ['appointments', query],
    queryFn: () => api<Paginated<AppointmentView>>('/appointments', { query }),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useAppointment(id: string | null) {
  return useQuery({ queryKey: ['appointments', 'one', id], queryFn: () => api<AppointmentView>(`/appointments/${id}`), enabled: !!id });
}

export function useAppointmentEvents(id: string | null) {
  return useQuery({ queryKey: ['appointments', 'events', id], queryFn: () => api<AppointmentEventView[]>(`/appointments/${id}/events`), enabled: !!id });
}

export function useAvailability(clinicId: string | undefined, date: string, doctorId?: string) {
  return useQuery({
    queryKey: ['availability', clinicId, date, doctorId ?? 'all'],
    queryFn: () => api<{ closed: string | null; slots: AvailabilitySlot[] }>('/appointments/availability', { query: { clinicId, date, doctorId } }),
    enabled: !!clinicId,
  });
}

export function usePatientSearch(query: { q?: string; page?: number; pageSize?: number; sortBy?: string; sortDir?: string }, enabled = true) {
  return useQuery({
    queryKey: ['patients', query],
    queryFn: () => api<Paginated<PatientView>>('/patients', { query }),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function usePatient(id: string | null) {
  return useQuery({ queryKey: ['patients', 'one', id], queryFn: () => api<PatientView>(`/patients/${id}`), enabled: !!id });
}

/** Retrasa un valor (búsqueda mientras se escribe) para no consultar en cada tecla. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useRoles(enabled = true) {
  return useQuery({ queryKey: ['roles'], queryFn: () => api<RoleView[]>('/roles'), enabled, staleTime: 60_000 });
}
