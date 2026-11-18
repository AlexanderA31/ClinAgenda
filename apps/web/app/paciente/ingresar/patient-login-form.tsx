'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, LogIn, Phone } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';

export function PatientLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [documentNumber, setDocumentNumber] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/portal/login', { method: 'POST', body: { documentNumber, password } });
      const next = params.get('next');
      router.replace(next && next.startsWith('/paciente') ? next : '/paciente');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="font-display text-lg font-extrabold text-[var(--euc)]">Pacientes</p>
        <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Ingresar</h2>
        <p className="text-lg text-ink-2">Con su número de cédula o pasaporte y la contraseña que eligió al registrarse.</p>
      </div>
      {params.get('vence') && (
        <Notice tone="info" title="Su sesión terminó">
          Vuelva a ingresar para ver sus citas.
        </Notice>
      )}
      {error && (
        <Notice tone="danger" title="No pudo ingresar">
          {error}
        </Notice>
      )}
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field id="p-doc" label="Cédula o pasaporte">
          <Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} inputMode="text" autoComplete="username" autoCapitalize="characters" className="tabular min-h-14 text-lg" />
        </Field>
        <Field
          id="p-pass"
          label="Contraseña"
          addon={
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-ink-2 hover:text-ink"
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          }
        >
          <Input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="min-h-14 pr-14 text-lg" />
        </Field>
        <Button type="submit" size="lg" className="mt-2 rounded-full" disabled={busy || !documentNumber || !password}>
          <LogIn /> {busy ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
      <div className="flex flex-col gap-3 border-t border-rule pt-6 text-ink-2">
        <p>
          ¿Primera vez?{' '}
          <Link href="/paciente/registro" className="font-bold text-ballpoint underline underline-offset-4 hover:no-underline">
            Cree su cuenta
          </Link>{' '}
          en dos minutos.
        </p>
        <p className="flex items-start gap-3">
          <Phone className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
          <span>¿Olvidó su contraseña? Llame a su clínica: le ayudamos a recuperarla. También puede seguir agendando por teléfono.</span>
        </p>
        <Link href="/" className="w-fit font-bold text-ballpoint underline underline-offset-4 hover:no-underline">
          Volver a la página de las clínicas
        </Link>
      </div>
    </div>
  );
}
