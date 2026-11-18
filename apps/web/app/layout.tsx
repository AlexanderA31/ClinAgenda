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

// Aplica tema y tamaño de letra guardados antes de pintar, para que no "parpadee".
const prefsScript = `try{var t=localStorage.getItem('ca-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;if(localStorage.getItem('ca-text')==='grande')document.documentElement.dataset.text='grande'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-EC" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prefsScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
