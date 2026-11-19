'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { SignInSchema, type SignInInput, type SignInResult } from '@clinagenda/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';
import { safeNext } from '@/lib/paths';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const { register, handleSubmit, formState } = useForm<SignInInput>({ resolver: zodResolver(SignInSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      // Un solo ingreso: la API dice si la cuenta es del personal o de un paciente.
      const result = await api<SignInResult>('/auth/sign-in', { method: 'POST', body: values });
      const next = params.get('next');
      if (result.kind === 'patient') {
        router.replace(safeNext(next, 'patient') ?? '/paciente');
        return;
      }
      qc.setQueryData(['me'], result.user);
      // Si la contraseña es temporal, la agenda se abre con el aviso obligatorio para cambiarla.
      router.replace(safeNext(next, 'staff') ?? '/agenda');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="font-display text-lg font-extrabold text-[var(--euc)]">Pacientes y personal</p>
        <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Ingresar</h2>
        <p className="text-lg text-ink-2">Pacientes: su cédula o pasaporte. Personal: el usuario que le dio la dirección.</p>
      </div>

      {params.get('vence') && (
        <Notice tone="info" title="Su sesión terminó">
          Por seguridad, la sesión se cierra después de un tiempo. Vuelva a ingresar.
        </Notice>
      )}
      {error && (
        <Notice tone="danger" title="No pudo ingresar">
          {error}
        </Notice>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field id="username" label="Usuario, cédula o pasaporte" error={formState.errors.identifier?.message}>
          <Input autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-h-14 text-lg" {...register('identifier')} />
        </Field>
        <Field
          id="password"
          label="Contraseña"
          error={formState.errors.password?.message}
          addon={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-ink-2 hover:text-ink"
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          }
        >
          <Input type={show ? 'text' : 'password'} autoComplete="current-password" className="min-h-14 pr-14 text-lg" {...register('password')} />
        </Field>
        <Button type="submit" size="lg" className="mt-2 rounded-full" disabled={formState.isSubmitting}>
          <LogIn /> {formState.isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>

      <div className="flex flex-col gap-2 text-ink-2">
        <p>
          ¿No tiene cuenta?{' '}
          <Link href="/paciente/registro" className="font-bold text-ballpoint underline underline-offset-4 hover:no-underline">
            Crear mi cuenta
          </Link>
        </p>
        <p className="text-sm text-ink-3">¿Olvidó su contraseña? Pacientes: llamen a su clínica. Personal: pídala a la dirección.</p>
      </div>
    </div>
  );
}
