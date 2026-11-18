import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { AppointmentStatus } from '@clinagenda/schemas';
import { env } from '../../config/env';

export interface ReceiptData {
  code: string;
  status: AppointmentStatus;
  startsAt: Date;
  timezone: string;
  patientName: string;
  doctorName: string;
  specialty: string;
  clinic: { name: string; address: string | null; phone: string | null };
  publicToken: string;
}

const INK = '#142029';
const MUTED = '#44535f';
const EUC = '#23574a';

/** Enlace público del comprobante (/c/<token>): el mismo que recibe por WhatsApp. */
export function receiptUrl(token: string) {
  return `${env.WEB_ORIGIN.split(',')[0].trim().replace(/\/$/, '')}/c/${token}`;
}

/**
 * Comprobante en PDF (tamaño A5, para imprimir o guardar en el celular): día, hora, médico, clínica y
 * un código QR para ver o cancelar la cita. Sin cédula ni datos médicos, por si se pierde.
 */
export async function receiptPdf(r: ReceiptData): Promise<Buffer> {
  const url = receiptUrl(r.publicToken);
  const qr = await QRCode.toBuffer(url, { margin: 0, width: 240, errorCorrectionLevel: 'M' });
  const day = new Intl.DateTimeFormat('es-EC', { timeZone: r.timezone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(r.startsAt);
  const hour = new Intl.DateTimeFormat('es-EC', { timeZone: r.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(r.startsAt);

  const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `Comprobante ${r.code}`, Author: 'Clínicas Paredes' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const width = doc.page.width - 72;

  // Franja de la marca
  doc.rect(0, 0, doc.page.width, 78).fill(EUC);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('Clínicas Paredes', 36, 24);
  doc.font('Helvetica').fontSize(10).text('Comprobante de cita', 36, 50);
  doc.font('Helvetica-Bold').fontSize(10).text(r.code, 36, 50, { width, align: 'right' });

  let y = 100;
  if (r.status === 'CANCELLED') {
    doc.roundedRect(36, y, width, 28, 4).fill('#fbe9e7');
    doc.fillColor('#b8302a').font('Helvetica-Bold').fontSize(12).text('ESTA CITA FUE CANCELADA', 36, y + 9, { width, align: 'center' });
    y += 42;
  }

  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Paciente', 36, y);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(r.patientName, 36, y + 13, { width });
  y += 44;

  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Día y hora', 36, y);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(day.charAt(0).toUpperCase() + day.slice(1), 36, y + 13, { width });
  doc.fontSize(30).text(hour, 36, y + 34);
  y += 80;

  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Médico', 36, y);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(`${r.doctorName}`, 36, y + 13, { width });
  doc.font('Helvetica').fontSize(11).fillColor(MUTED).text(r.specialty, 36, y + 30, { width });
  y += 54;

  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Clínica', 36, y);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(r.clinic.name, 36, y + 13, { width });
  const contact = [r.clinic.address, r.clinic.phone ? `Teléfono ${r.clinic.phone}` : null].filter(Boolean).join(' · ');
  if (contact) doc.font('Helvetica').fontSize(11).fillColor(MUTED).text(contact, 36, y + 30, { width });
  y += 62;

  doc.fillColor(INK).font('Helvetica').fontSize(11).text('Llegue 10 minutos antes y traiga su cédula o pasaporte.', 36, y, { width });
  y += 26;

  // Recuadro con el QR para ver o cancelar
  const box = 120;
  doc.roundedRect(36, y, width, box + 20, 6).dash(4, { space: 3 }).strokeColor(MUTED).stroke().undash();
  doc.image(qr, 46, y + 10, { width: box, height: box });
  const tx = 46 + box + 14;
  const tw = width - box - 34;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text('¿No puede venir?', tx, y + 14, { width: tw });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(INK)
    .text('Escanee el código con la cámara del celular para ver o cancelar su cita (hasta 2 horas antes), o llame a la clínica. Así el espacio queda para otro paciente.', tx, y + 32, { width: tw });
  doc.fontSize(7).fillColor(MUTED).text(url, tx, y + box - 8, { width: tw, link: url });

  doc.end();
  return done;
}
