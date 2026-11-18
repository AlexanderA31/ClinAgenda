'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserPlus, UserX, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_LABELS, type Role, type UserView } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useClinics, useDoctors } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Notice, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RequireRole } from '@/components/layout/require-role';

export default function UsersPage() {
  return (
    <RequireRole roles={['ADMIN']}>
      <Users />
    </RequireRole>
  );
}

function Users() {
  const me = useSession();
  const qc = useQueryClient();
  const clinics = useClinics();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<UserView[]>('/users') });
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<UserView | null>(null);
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api<UserView>(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const clinicName = (id: string | null) => clinics.data?.find((c) => c.id === id)?.name ?? '—';

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Cada persona tiene su propio usuario: así la bitácora sabe quién hizo cada cambio. Nunca compartan contraseñas."
        actions={
          <Button size="lg" onClick={() => setCreating(true)}>
            <UserPlus /> Crear usuario
          </Button>
        }
      />
      {users.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="rounded-lg border border-rule bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Clínica</TableHead>
                <TableHead>Último ingreso</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-bold">
                    {u.fullName} {!u.active && <Badge tone="danger">Desactivado</Badge>}
                  </TableCell>
                  <TableCell className="font-mono">{u.username}</TableCell>
                  <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                  <TableCell>{clinicName(u.clinicId)}</TableCell>
                  <TableCell className="tabular text-ink-2">{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Nunca'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setResetFor(u)}>
                        <KeyRound /> Nueva contraseña
                      </Button>
                      {u.id !== me.id && (
                        <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: u.id, body: { active: !u.active } })}>
                          {u.active ? <UserX /> : <UserCheck />} {u.active ? 'Desactivar' : 'Activar'}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent side title="Crear usuario" description="La persona deberá cambiar la contraseña la primera vez que ingrese.">
          {creating && <CreateUser onDone={() => setCreating(false)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent title={`Nueva contraseña para ${resetFor?.fullName ?? ''}`} description="Désela en persona. Deberá cambiarla al ingresar.">
          {resetFor && <ResetPassword user={resetFor} onDone={() => setResetFor(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const clinics = useClinics();
  const doctors = useDoctors();
  const [form, setForm] = useState({ fullName: '', username: '', role: 'RECEPCION' as Role, password: '', clinicId: '', doctorId: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: { ...form, clinicId: form.clinicId || null, doctorId: form.doctorId || null } }),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['users'] }), toast.success('Usuario creado.'), onDone()),
    onError: (e) => setFields(e instanceof ApiRequestError ? e.fields : {}),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      {save.isError && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
      <Field id="u-name" label="Nombre completo" error={fields.fullName}>
        <Input value={form.fullName} onChange={set('fullName')} />
      </Field>
      <Field id="u-username" label="Usuario" hint="Sin espacios ni tildes, ej. rosa o m.vera" error={fields.username}>
        <Input value={form.username} onChange={set('username')} autoCapitalize="none" />
      </Field>
      <Field id="u-role" label="Rol">
        <Select value={form.role} onChange={set('role')}>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      {form.role === 'MEDICO' ? (
        <Field id="u-doctor" label="Ficha del médico" error={fields.doctorId}>
          <Select value={form.doctorId} onChange={set('doctorId')}>
            <option value="">Elija…</option>
            {doctors.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field id="u-clinic" label="Clínica principal" optional>
          <Select value={form.clinicId} onChange={set('clinicId')}>
            <option value="">Ninguna</option>
            {clinics.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field id="u-pass" label="Contraseña inicial" hint="Al menos 8 caracteres, con letras y números" error={fields.password}>
        <Input value={form.password} onChange={set('password')} autoComplete="new-password" />
      </Field>
      <Button type="submit" size="lg" disabled={save.isPending}>
        <UserPlus /> Crear usuario
      </Button>
    </form>
  );
}

function ResetPassword({ user, onDone }: { user: UserView; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const save = useMutation({
    mutationFn: () => api(`/users/${user.id}`, { method: 'PATCH', body: { resetPassword: password } }),
    onSuccess: () => (toast.success('Contraseña cambiada. El usuario también quedó desbloqueado.'), onDone()),
  });
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      <Field id="reset-pass" label="Nueva contraseña" hint="Al menos 8 caracteres, con letras y números" error={save.error instanceof ApiRequestError ? (save.error.fields.resetPassword ?? save.error.message) : undefined}>
        <Input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </Field>
      <Button type="submit" disabled={save.isPending}>
        <KeyRound /> Cambiar contraseña
      </Button>
    </form>
  );
}
