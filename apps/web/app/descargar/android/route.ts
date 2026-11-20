import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { androidApp } from '@/lib/app-download';

export const dynamic = 'force-dynamic';

/** Descarga del APK de Android para instalar la app sin tienda (primera entrega). */
export async function GET() {
  const app = await androidApp();
  if (!app) return NextResponse.json({ message: 'La app todavía no está disponible para descargar.' }, { status: 404 });
  const body = Readable.toWeb(createReadStream(app.file)) as ReadableStream;
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': String(app.bytes),
      'Content-Disposition': `attachment; filename="clinicas-paredes-${app.version}.apk"`,
      'Cache-Control': 'no-cache',
    },
  });
}
