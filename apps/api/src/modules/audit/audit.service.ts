import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditEntryView, AuditQuery, Paginated } from '@clinagenda/schemas';
import { Db, PrismaService } from '../../prisma/prisma.service';
import type { RequestMeta } from '../../common/decorators/auth.decorators';
import { DEFAULT_TZ, rangeBoundsUtc } from '../../common/utils/time';

export interface AuditEntry {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  meta?: RequestMeta;
}

/** Bitácora de quién hizo qué. Se escribe dentro de la misma transacción que el cambio: o quedan los dos, o ninguno. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db: Db = this.prisma) {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        before: toJson(entry.before),
        after: toJson(entry.after),
        ip: entry.meta?.ip ?? null,
        userAgent: entry.meta?.userAgent ?? null,
      },
    });
  }

  async list(q: AuditQuery): Promise<Paginated<AuditEntryView>> {
    const where: Prisma.AuditLogWhereInput = {
      entity: q.entity,
      entityId: q.entityId,
      userId: q.userId,
    };
    if (q.from || q.to) {
      const { start, end } = rangeBoundsUtc(q.from ?? '2000-01-01', q.to ?? '2999-12-31', DEFAULT_TZ);
      where.at = { gte: start, lt: end };
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: true },
        orderBy: { at: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        user: r.user ? { id: r.user.id, fullName: r.user.fullName, role: r.user.role } : null,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        summary: r.summary,
        before: r.before,
        after: r.after,
        ip: r.ip,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
      pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
