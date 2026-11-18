'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSIONS, SCOPE_LABELS, type Permission, type Role, type RoleView } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { useRoles } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Notice, PageHeader, Skeleton } from '@/components/ui/misc';
import { RequirePermission } from '@/components/layout/require-role';

export default function RolesPage() {
  return (
    <RequirePermission permission="roles.gestionar">
      <Roles />
    </RequirePermission>
  );
}

const GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))];

type Draft = { id?: string; name: string; description: string; scope: Role; permissions: Permission[] };

function Roles() {
  const roles = useRoles();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<RoleView | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => (void qc.invalidateQueries({ queryKey: ['roles'] }), toast.success('Rol borrado.'), setDeleting(null)),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader
        title="Roles y permisos"
        description="Un rol dice qué información ve una persona y qué puede hacer con ella. Ver la agenda, los pacientes y los médicos lo puede cualquiera con usuario; los permisos cubren lo demás."
        actions={
          <Button size="lg" onClick={() => setDraft({ name: '', description: '', scope: 'RECEPCION', permissions: [] })}>
            <Plus /> Crear rol
          </Button>
        }
      />

      {roles.isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <ul className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
            {roles.data?.map((r) => (
              <li key={r.id} className="flex min-w-0 flex-col gap-4 rounded-lg border border-rule bg-surface p-5">
                <div className="flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 font-display text-xl font-bold">{r.name}</h2>
                    {r.locked ? (
                      <Badge tone="info" className="shrink-0 whitespace-nowrap">
                        <Lock /> Protegido
                      </Badge>
                    ) : r.system ? (
                      <Badge className="shrink-0 whitespace-nowrap">De fábrica</Badge>
                    ) : (
                      <Badge tone="good" className="shrink-0 whitespace-nowrap">
                        A medida
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-ink-3">{SCOPE_LABELS[r.scope].label}</p>
                </div>
                <p className="line-clamp-2 min-h-12 text-ink-2">{r.description ?? 'Sin descripción.'}</p>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-bold">
                      {r.permissions.length} de {PERMISSIONS.length} permisos
                    </span>
                    <span className="flex items-center gap-1 text-ink-2">
                      <Users className="size-4" aria-hidden /> {r.userCount} {r.userCount === 1 ? 'persona' : 'personas'}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div className="h-full rounded-full bg-ballpoint" style={{ width: `${(r.permissions.length / PERMISSIONS.length) * 100}%` }} />
                  </div>
                </div>
                {/* Mismas acciones en el mismo lugar en todas las tarjetas */}
                <div className="mt-auto grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 border-t border-rule pt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={r.locked}
                    title={r.locked ? 'La dirección siempre tiene todos los permisos' : undefined}
                    onClick={() => setDraft({ id: r.id, name: r.name, description: r.description ?? '', scope: r.scope, permissions: r.permissions })}
                  >
                    <Pencil /> Editar
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setDraft({ name: `${r.name} (copia)`, description: r.description ?? '', scope: r.scope, permissions: r.permissions })}>
                    <Copy /> Duplicar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-10 px-0"
                    disabled={r.system}
                    aria-label={`Borrar el rol ${r.name}`}
                    title={r.system ? 'Los roles de fábrica no se borran' : 'Borrar'}
                    onClick={() => setDeleting(r)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* Vista de conjunto: qué permiso tiene cada rol */}
          <Card>
            <CardHeader>
              <CardTitle>Permisos de cada rol</CardTitle>
              <p className="text-sm text-ink-3">Para cambiar un rol, use “Editar” en su tarjeta.</p>
            </CardHeader>
            <CardBody className="overflow-x-auto px-0 py-0">
              <table className="w-full min-w-[44rem] text-left">
                <thead>
                  <tr className="border-b border-rule">
                    <th className="px-5 py-3 font-bold">Permiso</th>
                    {roles.data?.map((r) => (
                      <th key={r.id} className="w-32 px-2 py-3 text-center text-sm font-bold">
                        {r.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                {GROUPS.map((g) => (
                  <tbody key={g}>
                    <tr className="bg-surface-2">
                      <th colSpan={(roles.data?.length ?? 0) + 1} className="px-5 py-2 text-sm font-bold text-ink-2">
                        {g}
                      </th>
                    </tr>
                    {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                      <tr key={p.key} className="border-b border-rule last:border-0">
                        <td className="px-5 py-2.5">{p.label}</td>
                        {roles.data?.map((r) => (
                          <td key={r.id} className="px-2 py-2.5 text-center">
                            {r.permissions.includes(p.key) ? (
                              <Check className="mx-auto size-5 text-good" aria-label="Sí" />
                            ) : (
                              <span className="text-ink-3" aria-label="No">
                                —
                              </span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </CardBody>
          </Card>
        </>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent side title={draft?.id ? `Editar ${draft.name}` : 'Crear rol'} description="Los cambios valen de inmediato para todas las personas con este rol.">
          {draft && <RoleEditor draft={draft} onDone={() => setDraft(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent title={`¿Borrar el rol ${deleting?.name ?? ''}?`} description="Solo se puede borrar un rol que nadie usa.">
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting.id)}>
              <Trash2 /> Sí, borrar
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              No, volver
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RoleEditor({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(draft);
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () =>
      draft.id
        ? api(`/roles/${draft.id}`, { method: 'PATCH', body: { name: form.name, description: form.description || null, permissions: form.permissions } })
        : api('/roles', { method: 'POST', body: { name: form.name, description: form.description || null, scope: form.scope, permissions: form.permissions } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['roles'] });
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      toast.success(draft.id ? 'Rol actualizado.' : 'Rol creado.');
      onDone();
    },
    onError: (e) => setFields(e instanceof ApiRequestError ? e.fields : {}),
  });
  const toggle = (key: Permission) => setForm((f) => ({ ...f, permissions: f.permissions.includes(key) ? f.permissions.filter((p) => p !== key) : [...f.permissions, key] }));
  const toggleGroup = (group: string, on: boolean) => {
    const keys = PERMISSIONS.filter((p) => p.group === group).map((p) => p.key);
    setForm((f) => ({ ...f, permissions: on ? [...new Set([...f.permissions, ...keys])] : f.permissions.filter((p) => !keys.includes(p)) }));
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
      {save.isError && <Notice tone="danger">{errorMessage(save.error)}</Notice>}
      <Field id="r-name" label="Nombre del rol" error={fields.name}>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field id="r-desc" label="Para qué sirve" optional error={fields.description}>
        <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-bold">Qué información ve</legend>
        {draft.id && <p className="text-sm text-ink-3">No se cambia en un rol que ya existe. Si necesita otro alcance, duplique el rol.</p>}
        <div className="grid gap-2">
          {(Object.keys(SCOPE_LABELS) as Role[]).map((s) => (
            <label
              key={s}
              className={cn('flex cursor-pointer gap-3 rounded-md border-2 p-3', form.scope === s ? 'border-ballpoint bg-ballpoint-soft' : 'border-rule', draft.id && form.scope !== s && 'hidden')}
            >
              <input type="radio" name="scope" className="mt-1 size-5 accent-[var(--ballpoint)]" checked={form.scope === s} disabled={!!draft.id} onChange={() => setForm({ ...form, scope: s })} />
              <span>
                <span className="font-bold">{SCOPE_LABELS[s].label}</span>
                <span className="block text-sm text-ink-2">{SCOPE_LABELS[s].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 font-bold">
          Qué puede hacer{' '}
          <span className="font-normal text-ink-3">
            ({form.permissions.length} de {PERMISSIONS.length})
          </span>
        </legend>
        {GROUPS.map((g) => {
          const items = PERMISSIONS.filter((p) => p.group === g);
          const all = items.every((p) => form.permissions.includes(p.key));
          return (
            <div key={g} className="flex flex-col gap-1 rounded-md border border-rule">
              <div className="flex items-center justify-between gap-2 border-b border-rule bg-surface-2 px-3 py-2">
                <span className="font-bold">{g}</span>
                <Button type="button" variant="link" size="sm" onClick={() => toggleGroup(g, !all)}>
                  {all ? 'Quitar todos' : 'Marcar todos'}
                </Button>
              </div>
              {items.map((p) => (
                <label key={p.key} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-surface-2">
                  <input type="checkbox" className="size-5 accent-[var(--ballpoint)]" checked={form.permissions.includes(p.key)} onChange={() => toggle(p.key)} />
                  {p.label}
                </label>
              ))}
            </div>
          );
        })}
      </fieldset>

      <Button type="submit" size="lg" disabled={save.isPending}>
        <KeyRound /> {draft.id ? 'Guardar permisos' : 'Crear rol'}
      </Button>
    </form>
  );
}
