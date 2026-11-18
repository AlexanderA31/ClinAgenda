import { redirect } from 'next/navigation';

/** Hay un solo ingreso para pacientes y personal: /ingresar. Este enlace antiguo lleva allá. */
export default async function PatientLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next, vence } = await searchParams;
  const qs = new URLSearchParams({ ...(next ? { next } : {}), ...(vence ? { vence } : {}) }).toString();
  redirect(`/ingresar${qs ? `?${qs}` : ''}`);
}
