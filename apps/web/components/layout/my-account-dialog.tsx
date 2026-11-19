'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, LogOut, Save } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, type MyProfile } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { ChangePasswordForm } from '@/components/forms/change-password-form';

/** "Mi usuario": mis datos, lo que puedo hacer, mi contraseña y mis sesiones, sin salir de la pantalla en que estoy. */
export function MyAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side title="Mi usuario" description="Sus datos en ClinAgenda.">
        {open && <MyAccount />}
      </DialogContent>
    </Dialog>
  );
}

function MyAccount() {
  const user = useSession();
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['me', 'profile'], queryFn: () => api<MyProfile>('/auth/me/profile') });
  const [name, setName] = useState(user.fullName);
  const saveName = useMutation({
    mutationFn: () => api<MyProfile>('/auth/me', { method: 'PATCH', body: { fullName: name } }),
    onSuccess: (p) => {
      setName(p.fullName);
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Nombre actualizado.');
    },
  });
  const revoke = useMutation({
    mutationFn: () => api('/auth/me/revoke-other-sessions', { method: 'POST' }),
    onSuccess: () => toast.success('Listo: en los demás equipos tendrá que volver a ingresar.'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const [changing, setChanging] = useState(false);
  const allowed = PERMISSIONS.filter((p) => user.permissions.includes(p.key));
  const p = profile.data;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-ballpoint font-display text-2xl font-extrabold text-ballpoint-ink" aria-hidden>
          {initials(user.fullName)}
        </span>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold leading-tight">{user.fullName}</p>
          <p className="text-ink-2">{user.roleName}</p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-xl font-bold">Mis datos</h3>
        {!p ? (
          <Skeleton className="h-40" />
        ) : (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 rounded-md border border-rule [&>*]:border-b [&>*]:border-rule [&>*]:px-4 [&>*]:py-2.5 [&>*:nth-last-child(-n+2)]:border-0">
            <dt className="text-ink-2">Usuario</dt>
            <dd className="font-mono">{p.username}</dd>
            <dt className="text-ink-2">Rol</dt>
            <dd className="font-bold">{p.roleName}</dd>
            <dt className="text-ink-2">Clínicas</dt>
            <dd>{p.clinicNames.length && user.role !== 'ADMIN' ? p.clinicNames.join(', ') : 'Todas'}</dd>
            {p.doctorName && (
              <>
                <dt className="text-ink-2">Agenda de</dt>
                <dd>{p.doctorName}</dd>
              </>
            )}
            <dt className="text-ink-2">Último ingreso</dt>
            <dd className="tabular">{p.lastLoginAt ? dateTime(p.lastLoginAt) : '—'}</dd>
            <dt className="text-ink-2">Cuenta creada</dt>
            <dd className="tabular">{dateTime(p.createdAt)}</dd>
          </dl>
        )}
        <form className="flex flex-col gap-3" onSubmit={(e) => (e.preventDefault(), saveName.mutate())}>
          <Field
            id="me-name"
            label="Nombre completo"
            hint="Así aparece en la bitácora y en los avisos."
            error={saveName.error instanceof ApiRequestError ? (saveName.error.fields.fullName ?? saveName.error.message) : undefined}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Button type="submit" variant="secondary" className="w-fit" disabled={saveName.isPending || name.trim() === user.fullName}>
            <Save /> Guardar nombre
          </Button>
        </form>
        <p className="text-sm text-ink-3">El usuario, el rol y las clínicas los cambia la dirección.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-xl font-bold">Lo que puedo hacer</h3>
        <p className="text-ink-2">Todos pueden ver la agenda, los pacientes, los médicos y las clínicas. Además, su rol le permite:</p>
        <ul className="flex flex-col gap-1.5">
          {allowed.map((perm) => (
            <li key={perm.key} className="flex items-start gap-2">
              <Check className="mt-0.5 size-5 shrink-0 text-good" aria-hidden />
              {perm.label}
            </li>
          ))}
          {!allowed.length && <li className="text-ink-3">Solo consultar.</li>}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-xl font-bold">Contraseña</h3>
        <p className="text-ink-2">Le pediremos la actual y la nueva dos veces. Cámbiela si cree que alguien más la conoce.</p>
        <Button variant="secondary" className="w-fit" onClick={() => setChanging(true)} aria-haspopup="dialog">
          <KeyRound /> Cambiar contraseña
        </Button>
        <Dialog open={changing} onOpenChange={setChanging}>
          <DialogContent title="Cambiar contraseña" description="Al terminar, la nueva sirve desde el próximo ingreso.">
            {changing && <ChangePasswordForm onDone={() => setChanging(false)} />}
          </DialogContent>
        </Dialog>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-xl font-bold">Sesiones</h3>
        <p className="text-ink-2">Si dejó la sesión abierta en otra computadora o perdió el celular, ciérrela allá sin salir de aquí.</p>
        <Button variant="secondary" className="w-fit" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
          <LogOut /> Cerrar mi sesión en los demás equipos
        </Button>
      </section>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}
