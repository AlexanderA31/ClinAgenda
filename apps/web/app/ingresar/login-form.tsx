'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, LogIn } from 'lucide-react';
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
      router.replace(user.mustChangePassword ? '/cuenta?primera=1' : next && next.startsWith('/') ? next : '/agenda');
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <div className="flex w-full max-w-md flex-col gap-6 rounded-lg border border-rule bg-surface p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-1">
        <Link href="/" className="font-display text-lg font-extrabold text-ballpoint">
          ClinAgenda
        </Link>
        <h1 className="text-3xl font-extrabold">Ingresar</h1>
        <p className="text-ink-2">Escriba el usuario y la contraseña que le dio la dirección.</p>
      </div>

      {params.get('vence') && <Notice tone="info" title="Su sesión terminó">Por seguridad, la sesión se cierra después de unas horas. Vuelva a ingresar.</Notice>}
      {error && <Notice tone="danger" title="No pudo ingresar">{error}</Notice>}

      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field id="username" label="Usuario" error={formState.errors.username?.message}>
          <Input autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} {...register('username')} />
        </Field>
        <Field
          id="password"
          label="Contraseña"
          error={formState.errors.password?.message}
          addon={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink-2 hover:text-ink"
              aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          }
        >
          <Input type={show ? 'text' : 'password'} autoComplete="current-password" className="pr-14" {...register('password')} />
        </Field>
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>
          <LogIn /> {formState.isSubmitting ? 'Ingresando…' : 'Ingresar'}
        </Button>
      </form>
      <p className="text-sm text-ink-3">¿Olvidó su contraseña? Pídale a la Dra. Paredes que la restablezca desde “Usuarios”.</p>
    </div>
  );
}
