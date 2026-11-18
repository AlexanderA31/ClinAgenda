import type { Metadata } from 'next';

export const metadata: Metadata = { title: { default: 'Mis citas', template: '%s · Clínicas Paredes' }, robots: { index: false, follow: false } };

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return children;
}
