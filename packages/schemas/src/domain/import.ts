import { z } from 'zod';
import { IsoDateTimeSchema } from './common';

export const ImportKindSchema = z.enum(['patients', 'doctors', 'appointments']);
export type ImportKind = z.infer<typeof ImportKindSchema>;

export const ImportRowResultSchema = z.object({
  row: z.number().int(),
  status: z.enum(['IMPORTED', 'FIXED', 'REJECTED', 'DUPLICATE']),
  messages: z.array(z.string()),
  data: z.record(z.unknown()).optional(),
});
export type ImportRowResult = z.infer<typeof ImportRowResultSchema>;

export const ImportReportSchema = z.object({
  id: z.string().uuid(),
  kind: ImportKindSchema,
  fileName: z.string(),
  dryRun: z.boolean(),
  total: z.number().int(),
  imported: z.number().int(),
  fixed: z.number().int(),
  rejected: z.number().int(),
  duplicates: z.number().int(),
  rows: z.array(ImportRowResultSchema),
  createdAt: IsoDateTimeSchema,
});
export type ImportReport = z.infer<typeof ImportReportSchema>;
