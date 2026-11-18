import type { PublicDirectory } from '@clinagenda/schemas';

// De norte a sur, como está la ciudad.
const ORDER = ['Clínica Norte', 'Clínica Centro', 'Clínica Sur'];

/**
 * Clínicas, horarios y médicos para las páginas públicas (servidor). Si la API no responde, devuelve
 * null y cada página muestra un aviso en vez de romperse. Se consulta como máximo cada 5 minutos.
 */
export async function getDirectory(): Promise<PublicDirectory | null> {
  try {
    const res = await fetch(`${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/api/public/directory`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = (await res.json()) as PublicDirectory;
    // Las clínicas nuevas van después de las tres de siempre.
    const rank = (name: string) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length);
    return { ...data, clinics: [...data.clinics].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)) };
  } catch {
    return null;
  }
}
