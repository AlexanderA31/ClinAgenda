'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';

/** Formulario de cambio de contraseña, usado en "Mi cuenta" y en el aviso obligatorio del primer ingreso. */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const mismatch = repeat.length > 0 && next !== repeat;
  const save = useMutation({
    mutationFn: () => api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } }),
    onSuccess: async () => {
      toast.success('Contraseña cambiada.');
      setCurrent('');
      setNext('');
      setRepeat('');
      await qc.invalidateQueries({ queryKey: ['me'] });
      onDone?.();
    },
  });
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {};

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), !mismatch && save.mutate())}>
      {save.isError && !Object.keys(fields).length && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
      <Field id="pw-current" label="Contraseña actual" hint="La que le dieron para ingresar" error={fields.currentPassword}>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field id="pw-new" label="Contraseña nueva" hint="Al menos 8 caracteres, con letras y números" error={fields.newPassword}>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field id="pw-repeat" label="Repita la contraseña nueva" error={mismatch ? 'Las dos contraseñas no coinciden.' : undefined}>
        <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" disabled={save.isPending || !current || !next || mismatch}>
        <KeyRound /> {save.isPending ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
    </form>
  );
}
