import PDFDocument from 'pdfkit';
import type { PrescriptionItem } from '@clinagenda/schemas';

export interface PrescriptionData {
  code: string;
  date: Date;
  timezone: string;
  patient: { name: string; age: number; document: string | null };
  doctor: { name: string; specialty: string };
  clinic: { name: string; address: string | null; phone: string | null } | null;
  allergies: string | null;
  diagnosis: string | null;
  diagnosisCode: string | null;
  items: PrescriptionItem[];
  instructions: string | null;
}

const INK = '#142029';
const MUTED = '#44535f';
const EUC = '#23574a';
const RED = '#b8302a';

/**
 * Receta en PDF (A5, como las de talonario): paciente, alergias, diagnóstico, medicamentos numerados
 * con dosis, frecuencia y duración, indicaciones y espacio para firma y sello del médico.
 */
export function prescriptionPdf(r: PrescriptionData): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `Receta ${r.code}`, Author: 'Clínicas Paredes' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const left = 36;
  const width = doc.page.width - 72;
  const bottom = doc.page.height - 36;
  const day = new Intl.DateTimeFormat('es-EC', { timeZone: r.timezone, day: 'numeric', month: 'long', year: 'numeric' }).format(r.date);

  // Franja de la marca
  doc.rect(0, 0, doc.page.width, 70).fill(EUC);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('Clínicas Paredes', left, 18);
  doc.font('Helvetica').fontSize(9).text(r.clinic ? [r.clinic.name, r.clinic.address, r.clinic.phone].filter(Boolean).join(' · ') : 'Medicina familiar · Quito', left, 42, { width: width - 90 });
  doc.font('Helvetica-Bold').fontSize(16).text('Receta', left, 22, { width, align: 'right' });
  doc.font('Helvetica').fontSize(9).text(r.code, left, 44, { width, align: 'right' });

  let y = 86;
  const row = (label: string, value: string, x: number, w: number) => {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(label, x, y, { width: w });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text(value, x, y + 10, { width: w });
  };
  row('Paciente', r.patient.name, left, width * 0.62);
  row('Fecha', day, left + width * 0.66, width * 0.34);
  y += 32;
  row('Edad', `${r.patient.age} años`, left, width * 0.3);
  row('Documento', r.patient.document ?? 'Sin documento', left + width * 0.33, width * 0.67);
  y += 32;

  if (r.allergies) {
    const text = `Alergias: ${r.allergies.replace(/\n+/g, '; ')}`;
    const h = doc.font('Helvetica-Bold').fontSize(9.5).heightOfString(text, { width: width - 16 }) + 10;
    doc.roundedRect(left, y, width, h, 3).fill('#fbe9e7');
    doc.fillColor(RED).text(text, left + 8, y + 5, { width: width - 16 });
    y += h + 8;
  }
  if (r.diagnosis || r.diagnosisCode) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Diagnóstico', left, y);
    doc.fillColor(INK).font('Helvetica').fontSize(10).text([r.diagnosisCode ? `CIE-10 ${r.diagnosisCode}` : null, r.diagnosis].filter(Boolean).join(' · '), left, y + 10, { width });
    y = doc.y + 8;
  }

  doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.6).strokeColor('#c9d2d6').stroke();
  y += 8;
  doc.fillColor(EUC).font('Helvetica-Bold').fontSize(20).text('Rp/', left, y);
  y += 26;

  r.items.forEach((item, i) => {
    if (y > bottom - 120) {
      doc.addPage();
      y = 36;
    }
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(`${i + 1}. ${item.medication}${item.dose ? ` ${item.dose}` : ''}`, left, y, { width });
    const how = [item.frequency, item.duration ? `durante ${item.duration}` : null].filter(Boolean).join(', ');
    let next = doc.y + 1;
    if (how) {
      doc.font('Helvetica').fontSize(10).fillColor(INK).text(how.charAt(0).toUpperCase() + how.slice(1), left + 14, next, { width: width - 14 });
      next = doc.y + 1;
    }
    if (item.instructions) {
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(MUTED).text(item.instructions, left + 14, next, { width: width - 14 });
      next = doc.y;
    }
    y = next + 9;
  });

  if (r.instructions) {
    if (y > bottom - 140) {
      doc.addPage();
      y = 36;
    }
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Indicaciones', left, y);
    doc.fillColor(INK).font('Helvetica').fontSize(10).text(r.instructions, left, y + 10, { width });
    y = doc.y + 10;
  }

  // Firma y sello al pie de la última página
  const sign = Math.max(y + 30, bottom - 70);
  if (sign > bottom - 40) doc.addPage();
  const sy = sign > bottom - 40 ? bottom - 70 : sign;
  doc.moveTo(left + width * 0.4, sy + 30).lineTo(left + width, sy + 30).lineWidth(0.8).strokeColor(INK).stroke();
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(r.doctor.name, left + width * 0.4, sy + 35, { width: width * 0.6, align: 'center' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(`${r.doctor.specialty} · Firma y sello`, left + width * 0.4, sy + 48, { width: width * 0.6, align: 'center' });

  doc.end();
  return done;
}
