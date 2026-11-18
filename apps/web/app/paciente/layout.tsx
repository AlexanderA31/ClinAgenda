import type { Metadata } from 'next';
import s from '@/components/landing/landing.module.css';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: { default: 'Mis citas', template: '%s · Clínicas Paredes' }, robots: { index: false, follow: false } };

/** Portal del paciente: misma identidad que la página pública de las clínicas. */
export default function PatientPortalLayout({ children }: { children: React.ReactNode }) {
  return <div className={cn(s.page, 'min-h-dvh')}>{children}</div>;
}
