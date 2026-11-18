import { PatientShell } from '@/components/portal/patient-shell';

/** Las pantallas del paciente con sesión comparten el marco del panel. */
export default function PatientPortalLayout({ children }: { children: React.ReactNode }) {
  return <PatientShell>{children}</PatientShell>;
}
