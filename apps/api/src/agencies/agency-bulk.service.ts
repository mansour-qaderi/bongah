import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { BulkResponse, BulkRowResult, Property } from '@bongah/shared-types';
import { bulkRowIdSchema, createPropertySchema, updatePropertySchema } from '@bongah/validation';
import { PropertyService } from '../property/property.service.js';

type Issue = { field: string; message: string };

@Injectable()
export class AgencyBulkService {
  private readonly logger = new Logger(AgencyBulkService.name);

  constructor(private readonly properties: PropertyService) {}

  /**
   * Publishes many listings at once. Every row goes through the very same code as POST /properties
   * (validation, the subscription check, map-pin rules), one row at a time and each in its own
   * transaction, so one bad row never costs the others and the answer says exactly which rows were
   * created. Rows are NOT de-duplicated: sending the same request twice creates the listings twice.
   */
  async create(userId: string, items: unknown[]): Promise<BulkResponse<Property>> {
    return this.run(items, async (item) => {
      const parsed = createPropertySchema.safeParse(item);
      if (!parsed.success) return invalid(parsed.error.issues);
      return { property: await this.properties.create(userId, parsed.data) };
    });
  }

  /** Edits many listings at once: each row is `{ id, ...the fields of PATCH /properties/:id }`, applied by the same code. */
  async update(userId: string, items: unknown[]): Promise<BulkResponse<Property>> {
    return this.run(items, async (item) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        return invalid([{ path: [], message: 'Each row must be an object' }]);
      }
      const { id, ...changes } = item as Record<string, unknown>;
      const parsedId = bulkRowIdSchema.safeParse(id);
      if (!parsedId.success) return invalid([{ path: ['id'], message: 'id must be a listing id' }]);
      const parsed = updatePropertySchema.safeParse(changes);
      if (!parsed.success) return invalid(parsed.error.issues);
      return { property: await this.properties.update(userId, parsedId.data, parsed.data) };
    });
  }

  private async run(
    items: unknown[],
    handle: (item: unknown) => Promise<{ property: Property } | { errors: Issue[] }>,
  ): Promise<BulkResponse<Property>> {
    const results: BulkRowResult<Property>[] = [];
    for (const [index, item] of items.entries()) {
      try {
        const outcome = await handle(item);
        if ('errors' in outcome) {
          results.push({
            index,
            ok: false,
            code: 'VALIDATION_FAILED',
            message: 'Validation failed',
            errors: outcome.errors,
          });
        } else {
          results.push({ index, ok: true, property: outcome.property });
        }
      } catch (error) {
        results.push({ index, ok: false, ...describeFailure(error, this.logger) });
      }
    }
    const succeeded = results.filter((result) => result.ok).length;
    return { total: results.length, succeeded, failed: results.length - succeeded, results };
  }
}

function invalid(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): { errors: Issue[] } {
  return { errors: issues.map((issue) => ({ field: issue.path.map(String).join('.'), message: issue.message })) };
}

/** A row's failure in the same words the single-listing endpoint would have used. */
function describeFailure(error: unknown, logger: Logger): { code: string; message: string } {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const body = typeof response === 'string' ? { message: response } : (response as { code?: unknown; message?: unknown });
    return {
      code: typeof body.code === 'string' ? body.code : `HTTP_${error.getStatus()}`,
      message: typeof body.message === 'string' ? body.message : error.message,
    };
  }
  // Not ours to explain: log it, tell the caller only that this row failed.
  logger.error(`Bulk row failed unexpectedly: ${String(error)}`);
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong with this row.' };
}
