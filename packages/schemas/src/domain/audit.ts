import { z } from 'zod';
import { IsoDateTimeSchema } from './common';

export const AuditQuerySchema = z.object({
  entity: z.string().max(40).optional(),
  entityId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const AuditEntryViewSchema = z.object({
  id: z.string().uuid(),
  at: IsoDateTimeSchema,
  user: z.object({ id: z.string().uuid(), fullName: z.string(), role: z.string() }).nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  summary: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  ip: z.string().nullable(),
});
export type AuditEntryView = z.infer<typeof AuditEntryViewSchema>;
