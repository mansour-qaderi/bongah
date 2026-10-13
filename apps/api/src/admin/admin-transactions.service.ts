import { Injectable } from '@nestjs/common';
import type { AdminTransactionItem, Paginated } from '@bongah/shared-types';
import type { AdminAuditQuery, AdminTransactionsQuery } from '@bongah/validation';
import type { AdminAuditEntry } from '@bongah/shared-types';
import { adminPersonSelect, toAdminPerson } from '../common/admin-person.js';
import { kabulDayStart } from '../contact/contact.time.js';
import { Prisma } from '../generated/prisma/client.js';
import { paymentInclude, toPaymentSummary } from '../hesabpay/hesabpay.mapper.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const transactionInclude = {
  ...paymentInclude,
  user: { select: adminPersonSelect },
  agency: { select: { agencyName: true } },
} satisfies Prisma.TransactionInclude;

@Injectable()
export class AdminTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The HesabPay transaction log: every payment attempt, newest first, filterable. Dates are Kabul days, inclusive. */
  async list(query: AdminTransactionsQuery): Promise<Paginated<AdminTransactionItem>> {
    const created: Prisma.DateTimeFilter = {};
    if (query.from) created.gte = kabulDayStart(query.from);
    if (query.to) created.lt = new Date(kabulDayStart(query.to).getTime() + DAY_MS);

    const where: Prisma.TransactionWhereInput = {
      status: query.status,
      purpose: query.purpose,
      ...(query.from || query.to ? { createdAt: created } : {}),
      ...(query.q
        ? {
            OR: [
              { receiptNumber: { contains: query.q, mode: 'insensitive' } },
              { hesabpayTxId: { contains: query.q } },
              { user: { phoneNumber: { contains: query.q.replace(/[\s\-()]/g, '') } } },
              ...(UUID.test(query.q) ? [{ id: query.q }] : []),
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: transactionInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        ...toPaymentSummary(row),
        hesabpay_tx_id: row.hesabpayTxId,
        user: toAdminPerson(row.user),
        agency_name: row.agency?.agencyName ?? null,
      })),
      meta: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    };
  }

  /** What admins did, newest first. */
  async auditLog(query: AdminAuditQuery): Promise<Paginated<AdminAuditEntry>> {
    const where: Prisma.AdminAuditLogWhereInput = {
      action: query.action,
      actorId: query.actor_id,
      targetType: query.target_type,
      targetId: query.target_id,
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        include: { actor: { select: adminPersonSelect } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        target_type: row.targetType,
        target_id: row.targetId,
        metadata: (row.metadata ?? null) as Record<string, unknown> | null,
        created_at: row.createdAt.toISOString(),
        actor: row.actor ? toAdminPerson(row.actor) : null,
      })),
      meta: { page: query.page, limit: query.limit, total, total_pages: Math.ceil(total / query.limit) },
    };
  }
}
