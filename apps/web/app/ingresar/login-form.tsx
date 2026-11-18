'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { LoginSchema, type LoginInput, type SessionUser } from '@clinagenda/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const { register, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const { user } = await api<{ user: SessionUser }>('/auth/login', { method: 'POST', body: values });
      qc.setQueryData(['me'], user);
      const next = params.get('next');
      // Si la contraseña es temporal, la agenda se abre con el aviso obligatorio para cambiarla.
      router.replace(next && next.startsWith('/') ? next : '/agenda');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <div className="flex w-full max-w-md flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="font-display text-lg font-extrabold text-ballpoint">ClinAgenda</p>
        <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Ingresar</h2>
        <p className="text-lg text-ink-2">Escriba el usuario y la contraseña que le dio la dirección.</p>
      </div>

      {params.get('vence') && (
        <Notice tone="info" title="Su sesión terminó">
          Por seguridad, la sesión se cierra después de unas horas o cuando la dirección lo pide. Vuelva a ingresar.
        </Notice>
      )}
      {error && (
        <Notice tone="danger" title="No pudo ingresar">
          {error}
        </Notice>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field id="username" label="Usuario" error={formState.errors.username?.message}>
          <Input autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-h-14 text-lg" {...register('username')} />
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

      <div className="flex flex-col gap-3 border-t border-rule pt-6 text-ink-2">
        <p className="flex items-start gap-3">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
          <span>¿Olvidó su contraseña o quedó bloqueado? La dirección puede darle una nueva o desbloquearlo desde “Usuarios”.</span>
        </p>
        <p className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
          <span>Use solo su propio usuario: cada cambio queda registrado a su nombre.</span>
        </p>
        <Link href="/" className="w-fit font-bold text-ballpoint underline underline-offset-4 hover:no-underline">
          Volver a la página de las clínicas
        </Link>
      </div>
    </div>
  );
}
