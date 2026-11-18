import type { Metadata, Viewport } from 'next';
// Fuentes alojadas en la propia app (no en Google): cargan aunque falle el internet externo
// y quedan guardadas por el service worker para la Clínica Sur.
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource-variable/bricolage-grotesque/index.css';
import '@fontsource/caveat/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import { Providers } from './providers';
import { AccessibilityButton } from '@/components/layout/accessibility-button';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ClinAgenda', template: '%s · ClinAgenda' },
  description: 'Agenda de citas para Clínica Centro, Norte y Sur.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1418' },
  ],
};

// Aplica las opciones de accesibilidad guardadas antes de pintar, para que no "parpadee".
const prefsScript = `try{var d=document.documentElement.dataset,g=function(k){return localStorage.getItem(k)};var t=g('ca-theme');if(t==='dark'||t==='light')d.theme=t;var x=g('ca-text');if(x==='grande'||x==='muy-grande')d.text=x;if(g('ca-contrast')==='alto')d.contrast='alto';if(g('ca-motion')==='reducido')d.motion='reducido';if(g('ca-links')==='subrayados')d.links='subrayados';if(g('ca-spacing')==='amplio')d.spacing='amplio'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-EC" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prefsScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <AccessibilityButton />
      </body>
    </html>
  );
}
