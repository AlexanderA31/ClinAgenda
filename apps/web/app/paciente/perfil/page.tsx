'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, IdCard, KeyRound, LogOut, Mail, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import type { PortalMe } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { dateTime, phone as formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice, Skeleton } from '@/components/ui/misc';
import { PortalHeader, usePortalMe } from '@/components/portal/portal-header';
import landing from '@/components/landing/landing.module.css';

/** Mi perfil: mis datos, cómo ubicarme, mi contraseña y mis sesiones. */
export default function PatientProfilePage() {
  const me = usePortalMe();
  return (
    <>
      <PortalHeader />
      <main className={cn(landing.gutter, 'pb-28 pt-8')}>
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Mi perfil</h1>
            <p className="text-lg text-ink-2">Sus datos en Clínicas Paredes. Los usamos solo para sus citas.</p>
          </div>
          {me.isPending ? (
            <Skeleton className="h-96" />
          ) : me.isError ? (
            <Notice tone="danger">{errorMessage(me.error)}</Notice>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div className="flex min-w-0 flex-col gap-5">
                <Identity me={me.data} />
                <Sessions me={me.data} />
              </div>
              <div className="flex min-w-0 flex-col gap-5">
                <Contact me={me.data} />
                <Password />
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function Card({ title, icon: Icon, children, className }: { title: string; icon: typeof UserRound; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-4 rounded-2xl border border-rule bg-surface p-5', className)}>
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <span className="grid size-9 place-items-center rounded-full bg-ballpoint-soft text-ballpoint" aria-hidden>
          <Icon className="size-5" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Lo que identifica su ficha médica: se corrige en la clínica, con el documento a la vista. */
function Identity({ me }: { me: PortalMe }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-rule bg-surface">
      <div className="flex items-center gap-4 bg-[var(--euc)] p-5 text-[var(--euc-ink)]">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-[var(--maiz)] font-display text-2xl font-extrabold text-[var(--maiz-ink)]" aria-hidden>
          {`${me.firstNames[0] ?? ''}${me.lastNames[0] ?? ''}`.toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="font-display text-2xl font-extrabold leading-tight">
            {me.firstNames} {me.lastNames}
          </p>
          <p className="opacity-90">Ficha {me.patientCode}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 px-5 py-3 [&>*]:border-b [&>*]:border-rule [&>*]:py-2.5 [&>*:nth-last-child(-n+2)]:border-0">
        <dt className="text-ink-2">{me.documentType === 'CEDULA' ? 'Cédula' : 'Pasaporte'}</dt>
        <dd className="tabular font-bold">{me.documentNumber}</dd>
        <dt className="text-ink-2">Nacimiento</dt>
        <dd className="font-bold first-letter:uppercase">
          {new Intl.DateTimeFormat('es-EC', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${me.birthDate}T12:00:00Z`))}{' '}
          <span className="font-normal text-ink-2">({me.age} años)</span>
        </dd>
        <dt className="text-ink-2">Cuenta en línea</dt>
        <dd>desde {dateTime(me.accountSince)}</dd>
      </dl>
      <p className="flex items-start gap-2 border-t border-rule px-5 py-3 text-sm text-ink-3">
        <IdCard className="mt-0.5 size-4 shrink-0" aria-hidden />
        ¿Algún dato de su documento está mal? Corríjalo en su clínica, con su cédula o pasaporte a la vista.
      </p>
    </section>
  );
}

function Contact({ me }: { me: PortalMe }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ phone: me.phone ? formatPhone(me.phone) : '', email: me.email ?? '', address: me.address ?? '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  useEffect(() => setForm({ phone: me.phone ? formatPhone(me.phone) : '', email: me.email ?? '', address: me.address ?? '' }), [me]);
  const save = useMutation({
    mutationFn: () => api<PortalMe>('/portal/me', { method: 'PATCH', body: { phone: form.phone, email: form.email || null, address: form.address || null } }),
    onSuccess: (m) => {
      qc.setQueryData(['portal', 'me'], m);
      setFields({});
      toast.success('Datos guardados. Así le avisaremos si su cita cambia.');
    },
    onError: (e) => setFields(e instanceof ApiRequestError ? e.fields : {}),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <Card title="Cómo ubicarlo" icon={Phone}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save.mutate())} noValidate>
        {save.isError && !Object.keys(fields).length && (
          <Notice tone="danger" className="sm:col-span-2">
            {errorMessage(save.error)}
          </Notice>
        )}
        <Field id="pf-phone" label="Celular" hint="Para avisarle si su cita cambia" error={fields.phone}>
          <Input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" />
        </Field>
        <Field id="pf-email" label="Correo" optional error={fields.email}>
          <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field id="pf-address" label="Dirección" optional error={fields.address} className="sm:col-span-2">
          <Input value={form.address} onChange={set('address')} autoComplete="street-address" placeholder="Barrio, calle principal y número" />
        </Field>
        <Button type="submit" className="w-fit sm:col-span-2" disabled={save.isPending}>
          <Save /> Guardar mis datos
        </Button>
      </form>
    </Card>
  );
}

function Password() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => api('/portal/me/password', { method: 'POST', body: { currentPassword: current, newPassword: next } }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setRepeat('');
      setFields({});
      toast.success('Contraseña cambiada. Se cerró su sesión en los demás equipos.');
    },
    onError: (e) => setFields(e instanceof ApiRequestError ? e.fields : {}),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== repeat) return setFields({ repeat: 'Las dos contraseñas no son iguales.' });
    save.mutate();
  };
  return (
    <Card title="Contraseña" icon={KeyRound}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        {save.isError && !Object.keys(fields).length && (
          <Notice tone="danger" className="sm:col-span-2">
            {errorMessage(save.error)}
          </Notice>
        )}
        <Field
          id="pw-current"
          label="Contraseña actual"
          error={fields.currentPassword}
          className="sm:col-span-2"
          addon={
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-ink-2 hover:text-ink"
              aria-label={show ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
            >
              {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          }
        >
          <Input type={show ? 'text' : 'password'} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className="pr-14" />
        </Field>
        <Field id="pw-new" label="Nueva contraseña" hint="8 o más, con letras y números" error={fields.newPassword}>
          <Input type={show ? 'text' : 'password'} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field id="pw-repeat" label="Repita la nueva" error={fields.repeat}>
          <Input type={show ? 'text' : 'password'} value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
        </Field>
        <Button type="submit" variant="secondary" className="w-fit sm:col-span-2" disabled={save.isPending || !current || !next}>
          <KeyRound /> Cambiar contraseña
        </Button>
      </form>
    </Card>
  );
}

function Sessions({ me }: { me: PortalMe }) {
  const router = useRouter();
  const qc = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => api('/portal/me/revoke-other-sessions', { method: 'POST' }),
    onSuccess: () => toast.success('Listo: en los demás equipos tendrá que volver a ingresar.'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const logout = async () => {
    await api('/portal/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    router.replace('/');
  };
  return (
    <Card title="Seguridad" icon={ShieldCheck}>
      <p className="text-ink-2">Último ingreso: {me.lastLoginAt ? dateTime(me.lastLoginAt) : '—'}</p>
      <p className="text-sm text-ink-3">Si ingresó desde una computadora prestada o perdió su celular, cierre su sesión allá sin salir de aquí.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="whitespace-normal text-left" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
          <ShieldCheck /> Cerrar sesión en otros equipos
        </Button>
        <Button variant="ghost" onClick={() => void logout()}>
          <LogOut /> Salir de este equipo
        </Button>
      </div>
      <p className="flex items-start gap-2 border-t border-rule pt-3 text-sm text-ink-3">
        <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
        ¿Olvidó su contraseña? Llame a su clínica: le ayudamos a recuperarla.
      </p>
    </Card>
  );
}
