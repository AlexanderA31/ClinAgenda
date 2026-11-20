import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { Download, LogIn, ShieldCheck, Smartphone } from 'lucide-react';
import e from '@/components/landing/editorial.module.css';
import { ANDROID_DOWNLOAD_PATH, androidApp } from '@/lib/app-download';
import { cn } from '@/lib/utils';

/** Dirección pública de esta página (detrás de Caddy llega en x-forwarded-*), para que el QR abra la descarga desde el celular. */
async function publicOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || /^\d+\.\d+\.\d+\.\d+/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

/**
 * "Lleve las clínicas en su celular": botón de descarga del APK y un QR para escanearlo desde el teléfono.
 * Si todavía no se compiló la app, la sección no aparece.
 */
export async function AppDownload() {
  const app = await androidApp();
  if (!app) return null;
  const url = `${await publicOrigin()}${ANDROID_DOWNLOAD_PATH}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#142029', light: '#ffffff' } });

  return (
    <section id="app" className={cn(e.gutter, 'scroll-mt-20 py-28')} aria-labelledby="app-title">
      <div className="mx-auto grid max-w-[90rem] items-center gap-12 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6" data-rise>
          <h2 id="app-title" className={cn(e.display, e.h2)}>
            Las clínicas en su celular
          </h2>
          <p className="max-w-[38rem] text-lg">
            Con la app de Clínicas Paredes agenda, ve y cancela sus citas, descarga su comprobante y revisa sus recetas. Para el personal, la agenda del día y la ficha médica en la mano.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a href={ANDROID_DOWNLOAD_PATH} download className={cn(e.cta, 'flex min-h-12 items-center gap-2 rounded-full px-6 font-bold')}>
              <Download className="size-5" aria-hidden /> Descargar para Android
            </a>
            <span className={e.muted}>
              Versión {app.version} · {mb(app.bytes)}
            </span>
          </div>
          <ol className={cn(e.ink2, 'flex max-w-[38rem] flex-col gap-2')}>
            <li className="flex gap-3">
              <Smartphone className="mt-1 size-5 shrink-0" aria-hidden /> 1. Descárguela desde el celular: toque el botón o, desde una computadora, escanee el código.
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="mt-1 size-5 shrink-0" aria-hidden /> 2. Ábrala: Android le pedirá permitir instalar apps de este origen. Acepte una sola vez.
            </li>
            <li className="flex gap-3">
              <LogIn className="mt-1 size-5 shrink-0" aria-hidden /> 3. Ingrese con su cédula o pasaporte y la misma contraseña de la página.
            </li>
          </ol>
          <p className={cn(e.muted, 'text-sm')}>Muy pronto también en Google Play y App Store.</p>
        </div>
        {/* En el celular no se puede escanear la propia pantalla: ahí basta el botón. */}
        <figure className="hidden flex-col items-center gap-3 justify-self-center md:flex" data-rise>
          <div className="w-56 max-w-full rounded-2xl bg-white p-4 shadow-lg [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label="Código QR para descargar la app de Android" dangerouslySetInnerHTML={{ __html: qr }} />
          <figcaption className={cn(e.ink2, 'text-center text-sm')}>Escanee con la cámara del celular</figcaption>
        </figure>
      </div>
    </section>
  );
}
