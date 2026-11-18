'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABELS } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice, PageHeader } from '@/components/ui/misc';

export default function AccountPage() {
  return (
    <Suspense>
      <Account />
    </Suspense>
  );
}

function Account() {
  const user = useSession();
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const mismatch = repeat.length > 0 && next !== repeat;
  const save = useMutation({
    mutationFn: () => api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } }),
    onSuccess: async () => {
      toast.success('Contraseña cambiada.');
      await qc.invalidateQueries({ queryKey: ['me'] });
      setCurrent('');
      setNext('');
      setRepeat('');
      if (params.get('primera')) router.replace('/agenda');
    },
  });
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {};

  return (
    <>
      <PageHeader title="Mi cuenta" description={`${user.fullName} · ${ROLE_LABELS[user.role]} · usuario ${user.username}`} />
      {user.mustChangePassword && (
        <Notice tone="warn" title="Antes de empezar, cambie su contraseña">
          La contraseña que le dieron es temporal. Elija una que solo usted sepa.
        </Notice>
      )}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardBody>
          <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), !mismatch && save.mutate())}>
            {save.isError && !Object.keys(fields).length && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
            <Field id="pw-current" label="Contraseña actual" error={fields.currentPassword}>
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </Field>
            <Field id="pw-new" label="Contraseña nueva" hint="Al menos 8 caracteres, con letras y números" error={fields.newPassword}>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </Field>
            <Field id="pw-repeat" label="Repita la contraseña nueva" error={mismatch ? 'Las dos contraseñas no coinciden.' : undefined}>
              <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
            </Field>
            <Button type="submit" size="lg" disabled={save.isPending || !current || !next || mismatch}>
              <KeyRound /> Guardar contraseña
            </Button>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
