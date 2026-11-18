'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Eye, EyeOff, UserPlus } from 'lucide-react';
import { PatientRegisterSchema } from '@clinagenda/schemas';
import { ApiRequestError, api, errorMessage } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/misc';

const STEP_ONE = ['documentType', 'documentNumber', 'firstNames', 'lastNames', 'birthDate', 'phone', 'email'];

/** Registro en dos pasos: primero quién es, después su contraseña. Mismas reglas que valida la API. */
export function PatientRegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ documentType: 'CEDULA' as 'CEDULA' | 'PASAPORTE', documentNumber: '', firstNames: '', lastNames: '', birthDate: '', phone: '', email: '' });
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [accept, setAccept] = useState(false);
  const [show, setShow] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const errorsOf = (issues: { path: (string | number)[]; message: string }[]) => {
    const out: Record<string, string> = {};
    for (const i of issues) out[String(i.path[0])] ??= i.message;
    return out;
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    // Revisa los datos del paso 1 con una contraseña de relleno: la real se pide en el paso 2.
    const r = PatientRegisterSchema.safeParse({ ...form, password: 'Relleno123', acceptPrivacy: true });
    const errs = r.success ? {} : Object.fromEntries(Object.entries(errorsOf(r.error.issues)).filter(([k]) => STEP_ONE.includes(k)));
    setFields(errs);
    if (!Object.keys(errs).length) setStep(2);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== repeat) return setFields({ repeat: 'Las dos contraseñas no son iguales.' });
    const r = PatientRegisterSchema.safeParse({ ...form, password, acceptPrivacy: accept });
    if (!r.success) {
      const errs = errorsOf(r.error.issues);
      setFields(errs);
      if (Object.keys(errs).some((k) => STEP_ONE.includes(k))) setStep(1);
      return;
    }
    setBusy(true);
    try {
      await api('/portal/register', { method: 'POST', body: { ...form, email: form.email || null, password, acceptPrivacy: accept } });
      router.replace('/paciente/agendar?nuevo=1');
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiRequestError && Object.keys(err.fields).length) {
        setFields(err.fields);
        if (Object.keys(err.fields).some((k) => STEP_ONE.includes(k))) setStep(1);
      }
      setError(errorMessage(err));
    }
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="font-display text-lg font-extrabold text-[var(--euc)]">Paso {step} de 2</p>
        <h2 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{step === 1 ? 'Sus datos' : 'Su contraseña'}</h2>
        <p className="text-lg text-ink-2">
          {step === 1 ? 'Los mismos de su cédula o pasaporte. Si ya se atendió con nosotros, usaremos su ficha.' : 'Con ella y su documento ingresará la próxima vez.'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2" aria-hidden>
          <span className="h-1.5 rounded-full bg-[var(--euc)]" />
          <span className={cn('h-1.5 rounded-full', step === 2 ? 'bg-[var(--euc)]' : 'bg-rule')} />
        </div>
      </div>

      {error && (
        <Notice tone="danger" title="No se pudo crear la cuenta">
          {error}
        </Notice>
      )}

      {step === 1 ? (
        <form onSubmit={next} className="flex flex-col gap-5" noValidate>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 font-bold">Documento</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['CEDULA', 'PASAPORTE'] as const).map((t) => (
                <label
                  key={t}
                  className={cn(
                    'flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-2 font-bold',
                    form.documentType === t ? 'border-ballpoint bg-ballpoint-soft text-ballpoint' : 'border-rule-strong text-ink-2',
                  )}
                >
                  <input type="radio" name="docType" className="sr-only" checked={form.documentType === t} onChange={() => setForm({ ...form, documentType: t })} />
                  {t === 'CEDULA' ? 'Cédula' : 'Pasaporte'}
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            id="r-doc"
            label={form.documentType === 'CEDULA' ? 'Número de cédula' : 'Número de pasaporte'}
            hint={form.documentType === 'CEDULA' ? '10 dígitos, sin guion' : undefined}
            error={fields.documentNumber}
          >
            <Input value={form.documentNumber} onChange={set('documentNumber')} inputMode={form.documentType === 'CEDULA' ? 'numeric' : 'text'} className="tabular" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="r-first" label="Nombres" error={fields.firstNames}>
              <Input value={form.firstNames} onChange={set('firstNames')} autoComplete="given-name" />
            </Field>
            <Field id="r-last" label="Apellidos" error={fields.lastNames}>
              <Input value={form.lastNames} onChange={set('lastNames')} autoComplete="family-name" />
            </Field>
          </div>
          <Field id="r-birth" label="Fecha de nacimiento" error={fields.birthDate}>
            <Input type="date" max={todayIso()} value={form.birthDate} onChange={set('birthDate')} autoComplete="bday" />
          </Field>
          <Field id="r-phone" label="Celular" hint="Por aquí le avisamos si su cita cambia" error={fields.phone}>
            <Input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="099 123 4567" />
          </Field>
          <Field id="r-email" label="Correo" optional error={fields.email}>
            <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" />
          </Field>
          <Button type="submit" size="lg" className="mt-2 rounded-full">
            Continuar <ArrowRight />
          </Button>
          <p className="text-ink-2">
            ¿Ya tiene cuenta?{' '}
            <Link href="/paciente/ingresar" className="font-bold text-ballpoint underline underline-offset-4 hover:no-underline">
              Ingrese aquí
            </Link>
            . Para niños o adolescentes, su representante puede llamar a la clínica.
          </p>
        </form>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <Field
            id="r-pass"
            label="Contraseña"
            hint="Al menos 8 caracteres, con letras y números"
            error={fields.password}
            addon={
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-14 items-center justify-center text-ink-2 hover:text-ink"
                aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            }
          >
            <Input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="pr-14" />
          </Field>
          <Field id="r-repeat" label="Repita la contraseña" error={fields.repeat}>
            <Input type={show ? 'text' : 'password'} value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
          </Field>
          <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-4">
            <p className="font-bold">Aviso de privacidad</p>
            <p className="text-ink-2">
              Usamos sus datos solo para agendar y avisarle sobre sus citas. Sus datos de salud solo los ve el personal que le atiende. Puede pedir que los corrijamos llamando a su clínica.
            </p>
            <label className="mt-1 flex cursor-pointer items-start gap-3">
              <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--ballpoint)]" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <span>Leí y acepto el aviso de privacidad.</span>
            </label>
            {fields.acceptPrivacy && <p className="text-sm font-bold text-redpen">{fields.acceptPrivacy}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="secondary" size="lg" className="rounded-full" onClick={() => setStep(1)}>
              <ArrowLeft /> Volver
            </Button>
            <Button type="submit" size="lg" className="flex-1 rounded-full" disabled={busy}>
              <UserPlus /> {busy ? 'Creando su cuenta…' : 'Crear mi cuenta'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
