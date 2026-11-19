'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, LogOut, Search, ShieldAlert, UserCheck, UserPlus, UserX, Users as UsersIcon, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, SCOPE_LABELS, type ClinicView, type RoleView, type UserView } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { dateTime, time } from '@/lib/format';
import { useClinics, useDoctors, useRoles } from '@/lib/queries';
import { useCan, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Notice, PageHeader, Skeleton } from '@/components/ui/misc';
import { Stat, StatGrid } from '@/components/ui/stat';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RequirePermission } from '@/components/layout/require-role';
import landing from '@/components/landing/landing.module.css';
import { toneClass } from '@/components/landing/tone';

export default function UsersPage() {
  return (
    <RequirePermission permission="usuarios.gestionar">
      <Users />
    </RequirePermission>
  );
}

/** "Usuario de Prueba" -> "UP": solo las palabras con mayúscula, sin "de", "del"… */
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

type StateFilter = '' | 'active' | 'locked' | 'pending' | 'inactive';

function Users() {
  const clinics = useClinics();
  const roles = useRoles();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<UserView[]>('/users') });
  const canRoles = useCan('roles.gestionar');
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [roleId, setRoleId] = useState('');
  const [state, setState] = useState<StateFilter>('');
  const selected = users.data?.find((u) => u.id === selectedId) ?? null;

  const all = users.data ?? [];
  const counts = {
    active: all.filter((u) => u.active).length,
    locked: all.filter((u) => u.active && u.lockedUntil).length,
    pending: all.filter((u) => u.active && u.mustChangePassword).length,
    inactive: all.filter((u) => !u.active).length,
  };
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (u) =>
        (!needle || u.fullName.toLowerCase().includes(needle) || u.username.includes(needle)) &&
        (!roleId || u.roleId === roleId) &&
        (state === '' ||
          (state === 'active' && u.active) ||
          (state === 'locked' && u.active && u.lockedUntil) ||
          (state === 'pending' && u.active && u.mustChangePassword) ||
          (state === 'inactive' && !u.active)),
    );
  }, [all, q, roleId, state]);
  /** "Norte, Centro" o "Todas": dónde trabaja cada persona. */
  const clinicNames = (u: UserView) =>
    u.role === 'ADMIN' || !u.clinicIds.length ? 'Todas' : u.clinicIds.map((id) => clinics.data?.find((c) => c.id === id)?.name.replace('Clínica ', '') ?? '…').join(', ');

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Cada persona tiene su propio usuario: así la bitácora sabe quién hizo cada cambio. Nunca compartan contraseñas."
        actions={
          <>
            {canRoles && (
              <Button variant="secondary" size="lg" asChild>
                <Link href="/roles">
                  <KeyRound /> Roles y permisos
                </Link>
              </Button>
            )}
            <Button size="lg" onClick={() => setCreating(true)}>
              <UserPlus /> Crear usuario
            </Button>
          </>
        }
      />

      <StatGrid>
        <Stat label="Activos" value={counts.active} icon={UsersIcon} tone="info" note="Pueden ingresar" />
        <Stat label="Bloqueados" value={counts.locked} icon={Lock} tone={counts.locked ? 'danger' : 'neutral'} note="Por intentos fallidos" />
        <Stat label="Clave temporal" value={counts.pending} icon={ShieldAlert} tone={counts.pending ? 'warn' : 'neutral'} note="Deben cambiarla al ingresar" />
        <Stat label="Desactivados" value={counts.inactive} icon={UserX} note="Su historial se conserva" />
      </StatGrid>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full min-w-0 sm:w-auto sm:max-w-sm sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Buscar por nombre o usuario" placeholder="Buscar por nombre o usuario" className="pl-11" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Rol" className="min-w-0 flex-1 sm:w-auto sm:flex-none" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Todos los roles</option>
          {roles.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Estado" className="min-w-0 flex-1 sm:w-auto sm:flex-none" value={state} onChange={(e) => setState(e.target.value as StateFilter)}>
          <option value="">Todos los estados</option>
          <option value="active">Activos</option>
          <option value="locked">Bloqueados</option>
          <option value="pending">Con contraseña temporal</option>
          <option value="inactive">Desactivados</option>
        </Select>
      </div>

      {users.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-rule bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Clínica</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Último ingreso</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((u) => (
                <TableRow key={u.id} className={u.active ? undefined : 'opacity-60'}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ballpoint-soft font-bold text-ballpoint" aria-hidden>
                        {initials(u.fullName)}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold">{u.fullName}</p>
                        <p className="font-mono text-sm text-ink-3">{u.username}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={u.role === 'ADMIN' ? 'info' : 'neutral'}>{u.roleName}</Badge>
                  </TableCell>
                  <TableCell className="text-ink-2">{clinicNames(u)}</TableCell>
                  <TableCell>
                    <UserState user={u} />
                  </TableCell>
                  <TableCell className="tabular text-ink-2">{u.lastLoginAt ? dateTime(u.lastLoginAt) : 'Nunca'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="secondary" size="sm" onClick={() => setSelectedId(u.id)}>
                      Administrar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!visible.length && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-ink-2">
                    Nadie coincide con la búsqueda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent side title="Crear usuario" description="La persona deberá cambiar la contraseña la primera vez que ingrese.">
          {creating && roles.data && <UserForm roles={roles.data} onDone={() => setCreating(false)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent side title={selected?.fullName ?? ''} description={selected ? `Usuario ${selected.username}` : undefined}>
          {selected && roles.data && <ManageUser key={selected.id} user={selected} roles={roles.data} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserState({ user }: { user: UserView }) {
  if (!user.active) return <Badge tone="neutral">Desactivado</Badge>;
  return (
    <div className="flex flex-wrap gap-1">
      {user.lockedUntil ? <Badge tone="danger">Bloqueado hasta las {time(user.lockedUntil)}</Badge> : <Badge tone="good">Activo</Badge>}
      {user.mustChangePassword && <Badge tone="warn">Contraseña temporal</Badge>}
    </div>
  );
}

/** Crear (sin user) o editar los datos de una persona. */
function UserForm({ roles, user, onDone }: { roles: RoleView[]; user?: UserView; onDone?: () => void }) {
  const qc = useQueryClient();
  const clinics = useClinics();
  const doctors = useDoctors();
  const [form, setForm] = useState({
    fullName: user?.fullName ?? '',
    username: user?.username ?? '',
    roleId: user?.roleId ?? roles.find((r) => r.scope === 'RECEPCION' && r.system)?.id ?? roles[0]?.id ?? '',
    password: '',
    clinicIds: user?.clinicIds ?? ([] as string[]),
    doctorId: user?.doctorId ?? '',
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const role = roles.find((r) => r.id === form.roleId);
  const save = useMutation({
    mutationFn: () => {
      // La dirección trabaja en todas: no se le guardan clínicas.
      const body = { fullName: form.fullName, roleId: form.roleId, clinicIds: role?.scope === 'ADMIN' ? [] : form.clinicIds, doctorId: form.doctorId || null };
      return user ? api(`/users/${user.id}`, { method: 'PATCH', body }) : api('/users', { method: 'POST', body: { ...body, username: form.username, password: form.password } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['roles'] });
      toast.success(user ? 'Cambios guardados.' : 'Usuario creado.');
      setFields({});
      onDone?.();
    },
    onError: (e) => setFields(e instanceof ApiRequestError ? e.fields : {}),
  });
  const set = (k: 'fullName' | 'username' | 'roleId' | 'password' | 'doctorId') => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      {save.isError && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
      <Field id="u-name" label="Nombre completo" error={fields.fullName}>
        <Input value={form.fullName} onChange={set('fullName')} />
      </Field>
      {!user && (
        <Field id="u-username" label="Usuario" hint="Sin espacios ni tildes, ej. rosa o m.vera" error={fields.username}>
          <Input value={form.username} onChange={set('username')} autoCapitalize="none" />
        </Field>
      )}
      <Field id="u-role" label="Rol" hint={role ? SCOPE_LABELS[role.scope].hint : undefined} error={fields.roleId}>
        <Select value={form.roleId} onChange={set('roleId')}>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="u-doctor" label="Ficha del médico" optional={role?.scope !== 'MEDICO'} hint="Vincula la cuenta con la agenda de ese médico" error={fields.doctorId}>
        <Select value={form.doctorId} onChange={set('doctorId')}>
          <option value="">{role?.scope === 'MEDICO' ? 'Elija…' : 'Ninguna'}</option>
          {doctors.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.fullName}
            </option>
          ))}
        </Select>
      </Field>
      {role?.scope === 'ADMIN' ? (
        <p className="rounded-md bg-surface-2 px-4 py-3 text-ink-2">La dirección trabaja en todas las clínicas.</p>
      ) : (
        <ClinicPicker clinics={clinics.data ?? []} value={form.clinicIds} onChange={(clinicIds) => setForm({ ...form, clinicIds })} error={fields.clinicIds} />
      )}
      {!user && (
        <Field id="u-pass" label="Contraseña inicial" hint="Al menos 8 caracteres, con letras y números" error={fields.password}>
          <Input value={form.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
      )}
      <Button type="submit" size="lg" disabled={save.isPending}>
        {user ? (
          'Guardar cambios'
        ) : (
          <>
            <UserPlus /> Crear usuario
          </>
        )}
      </Button>
    </form>
  );
}

/**
 * Clínicas donde trabaja la persona (por ejemplo, dónde hace recepción): una o varias de las que haya.
 * Solo da y maneja citas en esas; sin ninguna marcada, trabaja en todas.
 */
function ClinicPicker({ clinics, value, onChange, error }: { clinics: ClinicView[]; value: string[]; onChange: (ids: string[]) => void; error?: string }) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const active = clinics.filter((c) => c.active);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-bold">Clínicas donde trabaja</legend>
      <p className="text-sm text-ink-3">Solo podrá dar y manejar citas en las clínicas marcadas. Si no marca ninguna, trabaja en todas.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {active.map((c) => {
          const on = value.includes(c.id);
          return (
            <label
              key={c.id}
              className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-md border-2 px-3', on ? 'border-ballpoint bg-ballpoint-soft' : 'border-rule hover:border-rule-strong')}
            >
              <input type="checkbox" className="size-5 shrink-0 accent-[var(--ballpoint)]" checked={on} onChange={() => toggle(c.id)} />
              <span className="flex min-w-0 items-center gap-2 font-bold">
                <span className={cn(landing.dot, toneClass(c.name))} aria-hidden />
                <span className="truncate">{c.name}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-sm font-bold text-ink-2" aria-live="polite">
        {value.length ? `Trabaja en ${value.length} de ${active.length} clínicas.` : 'Trabaja en todas las clínicas.'}
      </p>
      {error && <p className="text-sm font-bold text-redpen">{error}</p>}
    </fieldset>
  );
}

function ManageUser({ user, roles }: { user: UserView; roles: RoleView[] }) {
  const me = useSession();
  const qc = useQueryClient();
  const self = user.id === me.id;
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [password, setPassword] = useState('');
  const done = (message: string) => () => {
    void qc.invalidateQueries({ queryKey: ['users'] });
    void qc.invalidateQueries({ queryKey: ['roles'] });
    toast.success(message);
  };
  const onError = (e: unknown) => toast.error(errorMessage(e));
  const unlock = useMutation({ mutationFn: () => api(`/users/${user.id}/unlock`, { method: 'POST' }), onSuccess: done('Usuario desbloqueado.'), onError });
  const revoke = useMutation({
    mutationFn: () => api(`/users/${user.id}/revoke-sessions`, { method: 'POST' }),
    onSuccess: done('Sesiones cerradas. Deberá volver a ingresar en todos sus equipos.'),
    onError,
  });
  const toggle = useMutation({
    mutationFn: () => api(`/users/${user.id}`, { method: 'PATCH', body: { active: !user.active } }),
    onSuccess: () => (done(user.active ? 'Usuario desactivado.' : 'Usuario reactivado.')(), setConfirmDeactivate(false)),
    onError,
  });
  const reset = useMutation({
    mutationFn: () => api(`/users/${user.id}`, { method: 'PATCH', body: { resetPassword: password } }),
    onSuccess: () => (done('Contraseña cambiada. También quedó desbloqueado y se cerraron sus sesiones.')(), setPassword('')),
  });
  const role = roles.find((r) => r.id === user.roleId);
  const allowed = PERMISSIONS.filter((p) => user.permissions.includes(p.key));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <UserState user={user} />
          <span className="text-ink-3">Último ingreso: {user.lastLoginAt ? dateTime(user.lastLoginAt) : 'nunca'}</span>
        </div>
        {self && <Notice tone="info">Es su propia cuenta: no puede desactivarse ni cambiarse el rol.</Notice>}
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="font-display text-xl font-bold">Datos y rol</h3>
        <UserForm roles={self ? roles.filter((r) => r.id === user.roleId) : roles} user={user} />
        {role && (
          <details className="rounded-md bg-surface-2 px-4 py-3">
            <summary className="cursor-pointer font-bold">
              Qué puede hacer con el rol {role.name} ({allowed.length} permisos)
            </summary>
            <ul className="mt-2 list-disc pl-5 text-ink-2">
              {allowed.map((p) => (
                <li key={p.key}>{p.label}</li>
              ))}
              {!allowed.length && <li>Solo consultar la agenda, pacientes, médicos y clínicas.</li>}
            </ul>
          </details>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-xl font-bold">Acceso</h3>
        <form className="flex flex-col gap-3 rounded-md border border-rule p-4" onSubmit={(e) => (e.preventDefault(), reset.mutate())}>
          <Field
            id="reset-pass"
            label="Nueva contraseña temporal"
            hint="Désela en persona. Deberá cambiarla al ingresar."
            error={reset.error instanceof ApiRequestError ? (reset.error.fields.resetPassword ?? reset.error.message) : undefined}
          >
            <Input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Button type="submit" variant="secondary" disabled={reset.isPending || !password}>
            <KeyRound /> Cambiar contraseña
          </Button>
        </form>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="secondary" disabled={!user.lockedUntil || unlock.isPending} onClick={() => unlock.mutate()}>
            <Unlock /> Desbloquear
          </Button>
          <Button variant="secondary" disabled={revoke.isPending || !user.active} onClick={() => revoke.mutate()}>
            <LogOut /> Cerrar sus sesiones
          </Button>
        </div>
        <p className="text-sm text-ink-3">“Cerrar sus sesiones” sirve si la persona perdió el celular o dejó la sesión abierta en otra computadora.</p>
      </section>

      {!self && (
        <section className="flex flex-col gap-3">
          <h3 className="font-display text-xl font-bold">{user.active ? 'Desactivar' : 'Reactivar'}</h3>
          {user.active ? (
            confirmDeactivate ? (
              <div className="flex flex-col gap-3 rounded-md border-2 border-redpen/40 bg-redpen-soft p-4">
                <p>
                  <strong>{user.fullName}</strong> ya no podrá ingresar y se cerrarán sus sesiones. Sus citas y su historial en la bitácora se conservan.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
                    <UserX /> Sí, desactivar
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDeactivate(false)}>
                    No, volver
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" className="w-fit" onClick={() => setConfirmDeactivate(true)}>
                <UserX /> Desactivar usuario
              </Button>
            )
          ) : (
            <Button className="w-fit" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
              <UserCheck /> Reactivar usuario
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
