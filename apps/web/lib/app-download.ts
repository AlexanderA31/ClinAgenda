import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * La app de Android (APK) que se ofrece en la página pública. No va dentro de la imagen ni del repositorio:
 * build-apk.sh la deja en apps/flutter/dist y docker-compose monta esa carpeta en el contenedor.
 */
const DIR = process.env.APP_DOWNLOADS_DIR ?? path.join(process.cwd(), '../flutter/dist');

export interface AndroidApp {
  file: string;
  version: string;
  bytes: number;
  updatedAt: Date;
}

/** La versión más reciente disponible, o null si todavía no se compiló ninguna. */
export async function androidApp(): Promise<AndroidApp | null> {
  try {
    const files = (await readdir(DIR)).filter((f) => /^clinicas-paredes-[\d.]+\.apk$/.test(f));
    const found = await Promise.all(
      files.map(async (f) => {
        const info = await stat(path.join(DIR, f));
        return { file: path.join(DIR, f), version: f.replace(/^clinicas-paredes-|\.apk$/g, ''), bytes: info.size, updatedAt: info.mtime };
      }),
    );
    return found.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
  } catch {
    return null;
  }
}

export const ANDROID_DOWNLOAD_PATH = '/descargar/android';
