import { z } from 'zod';

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

export interface AuditEntryView {
  id: string;
  at: string;
  user: { id: string; fullName: string; role: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  before: unknown;
  after: unknown;
  ip: string | null;
}
